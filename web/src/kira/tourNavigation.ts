export const TOUR_NAVIGATION_EVENT = 'kira:before-tour-navigation';
type TourNavigationDetail = {reason?: string};

/** Existing page guards can veto the tour before it navigates away. */
export function canStartTour(onBlocked?: (reason: string) => void): boolean {
  const event = new CustomEvent<TourNavigationDetail>(TOUR_NAVIGATION_EVENT, {cancelable: true, detail: {}});
  const allowed = document.dispatchEvent(event);
  if (!allowed && event.detail.reason) onBlocked?.(event.detail.reason);
  return allowed;
}

export function blockTourNavigation(event: Event, reason: string) {
  event.preventDefault();
  if (event instanceof CustomEvent && event.detail) (event as CustomEvent<TourNavigationDetail>).detail.reason = reason;
}
