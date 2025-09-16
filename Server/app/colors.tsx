import { Button } from "@heroui/button";
import { useEffect, useState } from "react";
import { Slider } from "@heroui/slider";

import { Select, SelectItem } from "@heroui/select";


export const rainbowColors = [
    { key: "red", label: "Red", color: "#FF1414" },
    { key: "orange", label: "Orange", color: "#FF7F00" },
    { key: "yellow", label: "Yellow", color: "#FFFF00" },
    { key: "green", label: "Green", color: "#00FF00" },
    { key: "blue", label: "Blue", color: "#0000FF" },
    { key: "indigo", label: "Indigo", color: "#4B0082" },
    { key: "violet", label: "Violet", color: "#8B00FF" },
];

export default function ColorsPanel() {
    // Pointer color
    const [southColor, setSouthColor] = useState("#FF1414");
    const [spawnColor, setSpawnColor] = useState("#FF1414");
    const [selectedSouthKey, setSelectedSouthKey] = useState<Set<string>>(new Set());
    const [selectedSpawnKey, setSelectedSpawnKey] = useState<Set<string>>(new Set());
    // Brightness
    const [brightness, setBrightness] = useState(56);

    useEffect(() => {
        const findKeyByColor = (color: string) =>
            rainbowColors.find(c => c.color.toUpperCase() === color.toUpperCase())?.key || "";

        setSelectedSouthKey(new Set([findKeyByColor(southColor)]));
        setSelectedSpawnKey(new Set([findKeyByColor(spawnColor)]));
    }, [southColor, spawnColor]);

    // useEffect(() => {
    //     console.log("Debounced:", brightness);
    //     setDebounceVal(brightness);
    //     fetch(`/brightness?brightness=${encodeURIComponent(brightness)}`, {
    //         method: "POST",
    //     });
    // }, [debounceValue]);
    // Get initial data
    useEffect(() => {
        fetch("/pointColors")
            .then(response => response.json())
            .then(data => {
                setSouthColor(data.southColor || "#FF1414");
                setSpawnColor(data.spawnColor || "#FF1414");
                fetch("/brightness")
                    .then(response => response.json())
                    .then(data => {
                        setBrightness(data.brightness || 56);
                    });
            });


    }, []);


    const handleSliderChange = (value: number | number[]) => {
        if (!Array.isArray(value)) {
            setBrightness(value);
        }
    };
    const saveColors = () => {
        const params = new URLSearchParams({
            southColor: southColor,
            spawnColor: spawnColor,
        });

        fetch(`/pointColors?${params.toString()}`, {
            method: "POST",
        });
        fetch(`/brightness?brightness=${encodeURIComponent(brightness)}`, {
            method: "POST",
        });
    };

    return <div className="w-full flex flex-col items-center justify-center flex-wrap gap-4">
        <p className="px-3 text-start w-full">Customize brightness and pointer colors,<br /> brightness takes effect immediately, colors take effect after restart</p>
        <Slider
            className="max-w-md"
            defaultValue={56}
            label="Brightness"
            value={brightness}
            onChange={handleSliderChange} // Listen for change events
            maxValue={100}
            minValue={1}
            step={1}
        />
        <Select
            className="max-w-xs"
            items={rainbowColors}
            label="Compass mode pointer color"
            placeholder="Please select a color"
            selectedKeys={selectedSouthKey}
            onSelectionChange={(keys) => {
                const key = Array.from(keys)[0];
                const color = rainbowColors.find(c => c.key === key)?.color || "#FF1414";
                setSouthColor(color);
            }}
        >
            {(color) => (
                <SelectItem
                    key={color.key}
                    startContent={<div className="w-4 h-4 rounded-full" style={{ backgroundColor: color.color }} />}
                >
                    {color.label}
                </SelectItem>
            )}
        </Select>
        <Select
            className="max-w-xs"
            items={rainbowColors}
            label="Spawn mode pointer color"
            placeholder="Please select a color"
            selectedKeys={selectedSpawnKey}
            onSelectionChange={(keys) => {
                const key = Array.from(keys)[0];
                const color = rainbowColors.find(c => c.key === key)?.color || "#FF1414";
                setSpawnColor(color);
            }}
        >
            {(color) => (
                <SelectItem
                    key={color.key}
                    startContent={<div className="w-4 h-4 rounded-full" style={{ backgroundColor: color.color }} />}
                >
                    {color.label}
                </SelectItem>
            )}
        </Select>
        <Button color="primary" variant="ghost" className="max-w-xs w-full" onClick={saveColors}>
            Save
        </Button>
    </div>;
}
