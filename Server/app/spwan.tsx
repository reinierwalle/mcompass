import { useEffect, useState } from "react";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/popover";
import { Progress } from "@heroui/progress";

export default function SpawnPanel() {
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');

    const [canSave, setCanSave] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorPopover, setErrorPopover] = useState(false);

    useEffect(() => {
        setIsSaving(true);
        // Get the current latitude and longitude
        fetch("/spawn")
            .then(response => response.json())
            .then(data => {
                if (data.latitude && data.longitude) {
                    setLatitude(data.latitude);
                    setLongitude(data.longitude);
                    setCanSave(true);
                }
            }).finally(() => {
                setIsSaving(false);
            });
    }, []);

    function onLatitudeChange(e: React.ChangeEvent<HTMLInputElement>) {
        const lat = e.target.value;
        setLatitude(lat);
        setCanSave(lat !== '' && longitude !== '');
        setErrorPopover(false);
    }

    function onLongitudeChange(e: React.ChangeEvent<HTMLInputElement>) {
        const lon = e.target.value;
        setLongitude(lon);
        setCanSave(latitude !== '' && lon !== '');
        setErrorPopover(false);
    }

    function handleSave() {
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        // make sure the lat is in the range of -90 to 90 
        if (lat && lon && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            console.log("Save ", lat, lon);
            setErrorPopover(false);
            setIsSaving(true);
            fetch(`/spawn?latitude=${latitude}&longitude=${longitude}`, {
                method: "POST"
            }).finally(() => {
                setIsSaving(false);
            });
        } else {
            console.log("Please enter both latitude and longitude");
            // show a toast
            setErrorPopover(true);
            setTimeout(() => {
                setErrorPopover(false);
            }, 2000);
        }
    }
    return <div className="w-full flex flex-col items-center justify-center flex-wrap gap-4">
        <p className="px-3 text-start w-full">Set spawn point<br />When GPS signal is available, it will point to this location</p>
        <Input type="number" label="Latitude" value={latitude} onChange={onLatitudeChange} />
        <Input type="number" label="Longitude" value={longitude} onChange={onLongitudeChange} />
        <Popover placement="bottom" isOpen={errorPopover} >
            <PopoverTrigger>
                <Button color="primary" variant="ghost" className="max-w-xs w-full" onClick={handleSave} isDisabled={!canSave}>
                    {isSaving ? <Progress
                        size="sm"
                        isIndeterminate
                        aria-label="Loading..."
                        className="max-w-md"
                    /> : "Save"}
                </Button>
            </PopoverTrigger>
            <PopoverContent>
                <div className="px-1 py-2">
                    <div className="text-small font-bold">Value Error</div>
                    <div className="text-tiny">Latitude range should be -90~90, longitude range should be -180~180.</div>
                </div>
            </PopoverContent>
        </Popover>
    </div>;
}
