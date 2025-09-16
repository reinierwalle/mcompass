import { Button } from "@heroui/button";
import { useEffect, useState } from "react";

export default function InfoPanel() {
    const [deviceInfo, setDeviceInfo] = useState({
        buildDate: "Unknown",
        buildTime: "Unknown",
        buildVersion: "Unknown",
        gitBranch: "Unknown",
        gitCommit: "Unknown",
        gpsStatus: "0",
        sensorStatus: "0",
    });

    useEffect(() => {
        fetch("/info")
            .then(response => response.json())
            .then(data => {
                if (data) {
                    setDeviceInfo(data);
                }
            });
    }, [])

    function reboot() {

    }

    return <div>
        <ul>
            <li>Firmware Version: {deviceInfo.buildVersion}</li>
            <li>Firmware Branch: {deviceInfo.gitBranch}</li>
            <li>Commit ID: {deviceInfo.gitCommit}</li>
            <li>Build Time: {deviceInfo.buildTime}</li>
            <li>Build Date: {deviceInfo.buildDate}</li>
            <li>GPS Status: {deviceInfo.gpsStatus === "1" ? "Available" : "Unavailable"}</li>
            <li>Geomagnetic Sensor Status: {deviceInfo.sensorStatus === "1" ? "Available" : "Unavailable"}</li>
            <Button color="danger" className="max-w-xs w-full" onClick={reboot}>
                Reboot
            </Button>
        </ul>
    </div>;
}
