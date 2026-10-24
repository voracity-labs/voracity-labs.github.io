// State machine for the mobile navigation menu.
//
// NavState: { isMobile: boolean, open: boolean, focusToggle: boolean }
// Invariant: !isMobile => !open (desktop always shows links; menu stays closed).

/**
 * Initial menu state: always closed, no pending focus move.
 * @param {boolean} isMobile
 */
export const initialNavState = (isMobile) => ({
  isMobile: Boolean(isMobile),
  open: false,
  focusToggle: false,
});

/**
 * Apply a NavEvent and return a new NavState (input is never mutated).
 * Unknown events leave the state unchanged apart from clearing focusToggle.
 * @param {{isMobile: boolean, open: boolean, focusToggle: boolean}} state
 * @param {{type: 'TOGGLE'|'LINK_ACTIVATED'|'ESCAPE'|'BREAKPOINT', isMobile?: boolean}} event
 */
export function navReducer(state, event) {
  const isMobile = Boolean(state.isMobile);
  // Normalize so the invariant holds even for a malformed input state.
  const open = isMobile && Boolean(state.open);
  const type = event && event.type;

  switch (type) {
    case 'TOGGLE':
      // Toggling only applies on mobile; on desktop it is a no-op (stays closed).
      return { isMobile, open: isMobile ? !open : false, focusToggle: false };

    case 'LINK_ACTIVATED':
      return { isMobile, open: false, focusToggle: false };

    case 'ESCAPE':
      if (open) return { isMobile, open: false, focusToggle: true };
      return { isMobile, open, focusToggle: false };

    case 'BREAKPOINT':
      return { isMobile: Boolean(event.isMobile), open: false, focusToggle: false };

    default:
      return { isMobile, open, focusToggle: false };
  }
}

/**
 * Value for the toggle button's aria-expanded attribute.
 * @returns {'true'|'false'}
 */
export const ariaExpanded = (state) => String(Boolean(state.open));
