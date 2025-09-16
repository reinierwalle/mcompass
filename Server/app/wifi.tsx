'use client';
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { useEffect, useState } from "react";

export default function WiFiPanel() {
    const [ssid, setSSID] = useState("");
    const [password, setPassword] = useState("");


    useEffect(() => {
        fetch("/wifi")
            .then(response => response.json())
            .then(data => {
                if (data.ssid && data.password) {
                    setSSID(data.ssid);
                    setPassword(data.password);
                }
            });
    }, []);

    function handlePasswordChange(e: any) {
        setPassword(e.target.value);
    }

    function handleSSIDChange(e: any) {
        console.log("SSID changed ", e.target.value);
        setSSID(e.target.value);
    }

    function saveWiFi() {
        fetch(`/setWiFi?ssid=${encodeURIComponent(ssid)}&password=${encodeURIComponent(password)}`, {
            method: "POST"
        });
    }

    return (
        <div className="flex flex-col items-center justify-center flex-wrap gap-4">
            <p className="px-3 text-start w-full">Set WiFi, takes effect after restart</p>
            <Input
                type="text"
                label="Wi-Fi Name"
                value={ssid}
                onChange={handleSSIDChange}
            />
            <Input
                type="text"
                label="Wi-Fi Password"
                value={password}
                onChange={handlePasswordChange}
            />
            
            <Button color="primary" variant="ghost" className="max-w-xs w-full" onClick={saveWiFi}>
                Save
            </Button>
        </div>
    );
}
