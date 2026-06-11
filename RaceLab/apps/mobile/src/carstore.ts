import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "racelab:car-profile";

/** Car identity (docs/02 §1.1: car = template + name + photo + notes).
 *  Cosmetic-but-emotional layer; lives beside sheets/logbook state. */
export interface CarProfile {
  name?: string;
  photo_uri?: string;
}

export function useCarProfile(): {
  profile: CarProfile;
  setProfile: (patch: Partial<CarProfile>) => void;
} {
  const [profile, set] = useState<CarProfile>({});

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as CarProfile;
          if (parsed && typeof parsed === "object") set(parsed);
        } catch {
          // cosmetic data: corrupt blob is safe to ignore
        }
      })
      .catch(() => {});
  }, []);

  const setProfile = useCallback((patch: Partial<CarProfile>) => {
    set((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { profile, setProfile };
}
