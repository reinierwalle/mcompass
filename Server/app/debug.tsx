import { Switch } from "@heroui/switch";
import { useState } from "react";

export default function DebugPanel() {

    const [fill, setFill] = useState(false);

    function onFillChange(value: boolean) {
        setFill(value);
    }

    function queryWifiList() {
        console.log("Query WiFi List");
        // Initiate a request to get the WiFi list
        // fetch("/get")
        //     .then(response => response.json())
        //     .then(data => {
        //         console.log(data);
        //     })
        //     .catch(error => {
        //         console.error("Error fetching WiFi list:", error);
        //     });
        // Post the color out

    }

    return <div className="w-full flex flex-col flex-wrap gap-4">
        <Switch className="w-full text-start " checked={fill} onValueChange={onFillChange}>Should we arrive the nether?</Switch>
    </div>;
}
