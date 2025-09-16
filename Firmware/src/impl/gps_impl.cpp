#include "board.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nmea_parser.h"
#include "utils.h"
#include "esp_timer.h"
#include "esp_log.h"

using namespace mcompass;

static const char* TAG = "GPS";

// GPS sleep configuration table
// distanceThreshold in km; sleepInterval in seconds; gpsPowerEn=true means keep GPS powered (no sleep)
static const SleepConfig sleepConfigs[] = {
    {10.0f,  0,        true},   // Within 10 km, do not sleep
    {50.0f,  5 * 60,   false},  // Beyond 50 km, sleep 5 minutes
    {100.0f, 10 * 60,  false},  // Beyond 100 km, sleep 10 minutes
    {200.0f, 15 * 60,  false},  // Beyond 200 km, sleep 15 minutes
};

// GPS sleep interval (seconds)
static uint32_t gpsSleepInterval = 60 * 60;  // default 1 hour

static nmea_parser_handle_t nmea_hdl = nullptr;

// Reusable GPS sleep timer (single handle, created once)
static esp_timer_handle_t s_gpsSleepTimer = nullptr;

// Worker pipeline to offload heavy work from the event loop
static QueueHandle_t s_gpsQueue = nullptr;

struct GpsMsg {
  float lat;
  float lon;
  bool valid;
};

// Timer callback runs in timer task context: keep it trivial
static void gps_sleep_cb(void* /*arg*/) {
  // Power OFF GPS after sleep interval expires (adjust logic if your wiring is inverted)
  digitalWrite(GPS_EN_PIN, LOW);
}

// Worker task: distance math, logging, and power control happen here (larger stack)
static void gps_worker(void* pv) {
  (void)pv;
  GpsMsg m{};
  for (;;) {
    if (xQueueReceive(s_gpsQueue, &m, portMAX_DELAY) != pdTRUE) {
      continue;
    }
    if (!m.valid) {
      continue;
    }

    Context& context = Context::getInstance();

    // Update current location and source
    Location latest{m.lat, m.lon};
    context.setCurrentLocation(latest);
    context.setSubscribeSource(Event::Source::SENSOR);

    // Compute distance to target
    auto current = context.getCurrentLocation();
    auto target  = context.getSpawnLocation();
    double distanceKm = utils::complexDistance(
        current.latitude, current.longitude, target.latitude, target.longitude);

    ESP_LOGI(TAG, "%.3f km to target", distanceKm);

    // Select nearest threshold (largest threshold <= distance)
    float thresholdKm = 0.0f;
    const size_t n = sizeof(sleepConfigs) / sizeof(SleepConfig);
    for (int i = static_cast<int>(n) - 1; i >= 0; --i) {
      if (distanceKm >= sleepConfigs[i].distanceThreshold) {
        thresholdKm = sleepConfigs[i].distanceThreshold;
        ESP_LOGI(TAG, "Using threshold %.3f km", thresholdKm);
        break;
      }
    }

    // If no threshold matched, skip sleep logic (do not sleep)
    if (thresholdKm <= 0.0f) {
      ESP_LOGD(TAG, "Distance %.3f km < smallest threshold; skip sleep decision", distanceKm);
      continue;
    }

    float modDistance = fmod(distanceKm, thresholdKm);

    // Decide sleep interval based on mod distance
    for (size_t i = 0; i < n; ++i) {
      if (modDistance <= sleepConfigs[i].distanceThreshold) {
        gpsSleepInterval = sleepConfigs[i].sleepInterval;

        if (sleepConfigs[i].gpsPowerEn) {
          // Keep GPS powered
          digitalWrite(GPS_EN_PIN, LOW);
          ESP_LOGD(TAG, "Keep GPS powered (gpsPowerEn=true)");
        } else {
          // Power GPS ON now, then schedule power OFF after interval
          digitalWrite(GPS_EN_PIN, HIGH);

          if (s_gpsSleepTimer != nullptr) {
            if (esp_timer_is_active(s_gpsSleepTimer)) {
              ESP_ERROR_CHECK(esp_timer_stop(s_gpsSleepTimer));
            }
            ESP_ERROR_CHECK(
                esp_timer_start_once(s_gpsSleepTimer, static_cast<uint64_t>(gpsSleepInterval) * 1000000ULL));
          }
          ESP_LOGI(TAG, "GPS sleep in %u seconds", gpsSleepInterval);
        }
        break;
      }
    }

    // Optional: monitor worker stack headroom
    // int32_t hw = uxTaskGetStackHighWaterMark(nullptr);
    // ESP_LOGD(TAG, "gps_worker HighWater=%d words (~%d bytes)", hw, hw * sizeof(StackType_t));
  }
}

/**
 * @brief GPS Event Handler
 *
 * Runs in the ESP event loop task context; keep it lightweight.
 */
static void gps_event_handler(void* event_handler_arg,
                              esp_event_base_t event_base,
                              int32_t event_id,
                              void* event_data) {
  (void)event_handler_arg;
  (void)event_base;

  if (event_id != GPS_UPDATE) {
    // Unknown or unhandled event
    return;
  }

  Context& context = Context::getInstance();

  // GPS detected when any serial data is parsed
  context.setDetectGPS(true);

  auto* gpsParser = static_cast<gps_t*>(event_data);
  // Fast validity check
  if (gpsParser->latitude == 0.0f || gpsParser->longitude == 0.0f) {
    ESP_LOGD(TAG, "Invalid GPS data");
    return;
  }

  // Keep logging minimal inside callback
  ESP_LOGD(TAG,
           "GPS %d,%d/%d/%d %02d:%02d:%02d => lat=%.5f lon=%.5f alt=%.2f spd=%.2f",
           gpsParser->valid,
           gpsParser->date.year + YEAR_BASE, gpsParser->date.month, gpsParser->date.day,
           gpsParser->tim.hour + TIME_ZONE, gpsParser->tim.minute, gpsParser->tim.second,
           gpsParser->latitude, gpsParser->longitude,
           gpsParser->altitude, gpsParser->speed);

  // Offload the heavy work to the worker task
  if (s_gpsQueue) {
    GpsMsg msg{gpsParser->latitude, gpsParser->longitude, gpsParser->valid != 0};
    // Best-effort send; drop if full to avoid blocking the event loop
    (void)xQueueSend(s_gpsQueue, &msg, 0);
  }
}

void gps::init(Context* context) {
  // Power ON GPS initially for presence detection (adjust if your wiring is inverted)
  digitalWrite(GPS_EN_PIN, LOW);

  // NMEA parser configuration and initialization
  nmea_parser_config_t config = NMEA_PARSER_CONFIG_DEFAULT();
  nmea_hdl = nmea_parser_init(&config);

  // Register event handler for NMEA parser library
  nmea_parser_add_handler(nmea_hdl, gps_event_handler, context);

  // Create a reusable sleep timer once
  if (s_gpsSleepTimer == nullptr) {
    esp_timer_create_args_t args = {
        .callback = gps_sleep_cb,
        .arg = nullptr,
        .dispatch_method = ESP_TIMER_TASK,
        .name = "gpsSleep",
#if ESP_IDF_VERSION_MAJOR >= 5
        .skip_unhandled_events = true
#endif
    };
    ESP_ERROR_CHECK(esp_timer_create(&args, &s_gpsSleepTimer));
  }

  // Create detection timeout timer: if no GPS detected within timeout, disable power
  esp_timer_handle_t gpsDisableTimer = nullptr;
  esp_timer_create_args_t gpsDisableTimerArgs = {
      .callback =
          [](void* arg) {
            auto ctx = static_cast<Context*>(arg);
            if (ctx->getDetectGPS()) {
              ESP_LOGI(TAG, "GPS detected, skip disable");
              return;
            }
            ESP_LOGI(TAG, "No GPS detected, disabling GPS power");
            gps::disable();
          },
      .arg = context,
      .dispatch_method = ESP_TIMER_TASK,
      .name = "gpsDisable",
#if ESP_IDF_VERSION_MAJOR >= 5
      .skip_unhandled_events = true
#endif
  };
  ESP_ERROR_CHECK(esp_timer_create(&gpsDisableTimerArgs, &gpsDisableTimer));
  ESP_ERROR_CHECK(esp_timer_start_once(gpsDisableTimer, DEFAULT_GPS_DETECT_TIMEOUT * 1000000ULL));

  // Create worker pipeline once
  if (s_gpsQueue == nullptr) {
    s_gpsQueue = xQueueCreate(8, sizeof(GpsMsg));
  }
  // Start worker task (larger stack to avoid overflow)
  static bool worker_started = false;
  if (!worker_started) {
    BaseType_t ok = xTaskCreatePinnedToCore(
        gps_worker, "gps_worker",
        6144,            // stack size in words (adjust if needed)
        nullptr,
        4,               // priority
        nullptr,
        1);              // run on core 1 to keep core 0 lighter
    if (ok != pdPASS) {
      ESP_LOGE(TAG, "Failed to create gps_worker task");
    } else {
      worker_started = true;
    }
  }
}

/**
 * @brief GPS disable
 */
void gps::disable() {
  // Unregister and deinit NMEA
  if (nmea_hdl != nullptr) {
    nmea_parser_remove_handler(nmea_hdl, gps_event_handler);
    nmea_parser_deinit(nmea_hdl);
    nmea_hdl = nullptr;
  }

  // Power OFF GPS (adjust if wiring inverted)
  digitalWrite(GPS_EN_PIN, HIGH);

  // Optional: stop sleep timer if active
  if (s_gpsSleepTimer && esp_timer_is_active(s_gpsSleepTimer)) {
    ESP_ERROR_CHECK(esp_timer_stop(s_gpsSleepTimer));
  }
}

bool gps::isValidGPSLocation(Location location) {
  if (location.latitude >= -90 && location.latitude <= 90 &&
      location.longitude >= -180 && location.longitude <= 180) {
    return true;
  }
  return false;
}
