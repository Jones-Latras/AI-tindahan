export const FLOATING_TAB_BAR_HEIGHT = 74;
export const FLOATING_TAB_BAR_MIN_BOTTOM_OFFSET = 16;
export const FLOATING_TAB_BAR_EXTRA_BOTTOM_OFFSET = 8;
export const FLOATING_CART_TOP_GAP = 10;

export function getFloatingTabBarBottomOffset(insetBottom: number) {
  return Math.max(insetBottom, FLOATING_TAB_BAR_MIN_BOTTOM_OFFSET) + FLOATING_TAB_BAR_EXTRA_BOTTOM_OFFSET;
}

export function getFloatingCartBottomOffset(insetBottom: number) {
  return getFloatingTabBarBottomOffset(insetBottom) + FLOATING_TAB_BAR_HEIGHT + FLOATING_CART_TOP_GAP;
}
