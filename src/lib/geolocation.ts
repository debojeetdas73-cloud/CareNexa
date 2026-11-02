export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export function getCurrentLocation(options: PositionOptions = {}): Promise<Coordinates> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Location is not supported by this browser."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      }),
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Enable it in your browser settings and try again."
          : error.code === error.POSITION_UNAVAILABLE
            ? "Your current location could not be determined. Try again or check your device location settings."
            : "Location lookup timed out. Please try again.";
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000, ...options },
    );
  });
}

export function distanceInKm(from: Coordinates, to: Coordinates): number | null {
  if (
    !Number.isFinite(from.latitude) ||
    !Number.isFinite(from.longitude) ||
    !Number.isFinite(to.latitude) ||
    !Number.isFinite(to.longitude) ||
    (to.latitude === 0 && to.longitude === 0)
  ) {
    return null;
  }

  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinDistance(
  distanceKm: number | null | undefined,
  radiusKm: number | null,
): boolean {
  if (radiusKm === null) return true;
  return Number.isFinite(radiusKm) && radiusKm >= 0 &&
    distanceKm != null && Number.isFinite(distanceKm) && distanceKm <= radiusKm;
}
