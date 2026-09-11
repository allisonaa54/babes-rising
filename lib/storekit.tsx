import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { Product, ProductSubscription, Purchase } from 'expo-iap';

type UseIAPHook = typeof import('expo-iap')['useIAP'];
let useIAPHook: UseIAPHook | null = null;

if (Platform.OS !== 'web') {
  try {
    useIAPHook = require('expo-iap').useIAP as UseIAPHook;
  } catch {
    // Expo Go does not include the StoreKit native module. The App Store build does.
  }
}

export const PREMIUM_PRODUCT_IDS = {
  monthly: 'babes_rising_monthly',
  yearly: 'babes_rising_yearly',
  lifetime: 'babes_rising_lifetime',
} as const;

type StoreProduct = Product | ProductSubscription;

export type PurchasesPackage = {
  identifier: string;
  product: {
    priceString: string;
    introPrice: null;
  };
  storeProduct: StoreProduct;
};

type PremiumInfo = {
  entitlements: {
    active: {
      premium?: object;
    };
  };
};

type SubscriptionContextValue = {
  customerInfo: PremiumInfo | null;
  offerings: {
    current: {
      availablePackages: PurchasesPackage[];
    };
  } | null;
  isSubscribed: boolean;
  isLoading: boolean;
  error: Error | null;
  purchase: (packageToPurchase: PurchasesPackage) => Promise<PremiumInfo>;
  restore: () => Promise<PremiumInfo>;
  isPurchasing: boolean;
  isRestoring: boolean;
};

const PRODUCT_IDS = Object.values(PREMIUM_PRODUCT_IDS);

function productIdOf(product: StoreProduct): string {
  return product.id;
}

function isPremiumPurchase(purchase: Purchase): boolean {
  return PRODUCT_IDS.includes(purchase.productId as (typeof PRODUCT_IDS)[number]);
}

function toPackage(product: StoreProduct): PurchasesPackage {
  return {
    identifier: productIdOf(product),
    product: {
      priceString: product.displayPrice,
      introPrice: null,
    },
    storeProduct: product,
  };
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function initializeStoreKit(): void {
  // expo-iap connects through its hook when the provider mounts.
}

function UnavailableSubscriptionProvider({ children }: { children: React.ReactNode }) {
  const unavailable = async (): Promise<PremiumInfo> => {
    throw new Error('Premium purchases are available in the App Store build.');
  };
  const value = useMemo<SubscriptionContextValue>(() => ({
    customerInfo: null,
    offerings: null,
    isSubscribed: false,
    isLoading: false,
    error: null,
    purchase: unavailable,
    restore: unavailable,
    isPurchasing: false,
    isRestoring: false,
  }), []);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

function NativeStoreKitSubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<Error | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [premiumActive, setPremiumActive] = useState(false);
  const {
    connected,
    products,
    subscriptions,
    availablePurchases,
    activeSubscriptions,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    getAvailablePurchases,
  } = useIAPHook!({
    onPurchaseSuccess: (purchase) => {
      if (isPremiumPurchase(purchase)) {
        setPremiumActive(true);
        void finishTransaction({ purchase, isConsumable: false }).catch((finishError) => {
          setError(finishError instanceof Error ? finishError : new Error('The purchase could not be completed.'));
        });
      }
    },
    onPurchaseError: (purchaseError) => {
      setError(purchaseError instanceof Error ? purchaseError : new Error('The purchase could not be completed.'));
    },
    onError: (iapError) => {
      setError(iapError);
    },
  });

  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: PRODUCT_IDS, type: 'all' }).catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError : new Error('Premium products could not be loaded.'));
    });
    void getAvailablePurchases().catch((restoreError) => {
      setError(restoreError instanceof Error ? restoreError : new Error('Purchases could not be restored.'));
    });
  }, [connected, fetchProducts, getAvailablePurchases]);

  const packages = useMemo(
    () => [...products, ...subscriptions].filter((product) => PRODUCT_IDS.includes(product.id as (typeof PRODUCT_IDS)[number])).map(toPackage),
    [products, subscriptions],
  );
  const hasPremiumPurchase = availablePurchases.some(isPremiumPurchase)
    || activeSubscriptions.some((purchase) => PRODUCT_IDS.includes(purchase.productId as (typeof PRODUCT_IDS)[number]));
  const isSubscribed = premiumActive || hasPremiumPurchase;

  const value = useMemo<SubscriptionContextValue>(() => ({
    customerInfo: isSubscribed ? { entitlements: { active: { premium: {} } } } : null,
    offerings: packages.length > 0 ? { current: { availablePackages: packages } } : null,
    isSubscribed,
    isLoading: connected && packages.length === 0,
    error,
    purchase: async (packageToPurchase) => {
      setError(null);
      setIsPurchasing(true);
      try {
        await requestPurchase({
          request: Platform.OS === 'ios'
            ? { apple: { sku: packageToPurchase.identifier } }
            : { google: { skus: [packageToPurchase.identifier] } },
          type: packageToPurchase.storeProduct.type,
        });
        return { entitlements: { active: { premium: {} } } };
      } finally {
        setIsPurchasing(false);
      }
    },
    restore: async () => {
      setError(null);
      setIsRestoring(true);
      try {
        await getAvailablePurchases();
        const restored = availablePurchases.some(isPremiumPurchase);
        if (restored) setPremiumActive(true);
        return { entitlements: { active: restored ? { premium: {} } : {} } };
      } finally {
        setIsRestoring(false);
      }
    },
    isPurchasing,
    isRestoring,
  }), [availablePurchases, connected, error, getAvailablePurchases, isPurchasing, isRestoring, isSubscribed, packages, requestPurchase]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  return useIAPHook
    ? <NativeStoreKitSubscriptionProvider>{children}</NativeStoreKitSubscriptionProvider>
    : <UnavailableSubscriptionProvider>{children}</UnavailableSubscriptionProvider>;
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used within SubscriptionProvider');
  return context;
}