import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

/**
 * Route contracts.
 *
 * Typing the param lists here is what makes `navigation.navigate('ProductForm',
 * { barcode })` a compile-time check — the scanner-to-create-product handoff
 * passes a barcode through navigation, and a typo there would only show up as
 * an empty form at the till.
 */

export type TabParamList = {
  Dashboard: undefined;
  /** `showInactive` opens the admin's deactivated-products view. */
  Products: { showInactive?: boolean } | undefined;
  Scanner: undefined;
  Inventory: undefined;
  Orders: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  ProductDetail: { productId: string };
  /**
   * No id creates; `barcode` pre-fills the form after an unknown scan.
   * `capturedBarcode` is written back by BarcodeCapture; `capturedAt` makes a
   * second capture of the same code still register as a change.
   */
  ProductForm: { productId?: string; barcode?: string; capturedBarcode?: string; capturedAt?: number };
  /** Scans one barcode and hands it back to the screen whose route key is `returnKey`. */
  BarcodeCapture: { returnKey: string };
  Cart: undefined;
  Checkout: undefined;
  OrderSuccess: { orderId: string };
  OrderDetail: { orderId: string };
  StockAdjust: { productId: string };
  MovementHistory: { productId?: string } | undefined;
  Profile: undefined;
  /** Admin back office. */
  Staff: undefined;
  Categories: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type TabScreenProps<T extends keyof TabParamList> = BottomTabScreenProps<TabParamList, T>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
