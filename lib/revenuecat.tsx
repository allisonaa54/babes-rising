import React, { createContext, useContext } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Purchases, { LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';

const TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = 'premium';

function getApiKey(): string {
  const isPreview = __DEV__ || Platform.OS === 'web' || Constants.executionEnvironment === 'storeClient';
  const apiKey = isPreview ? TEST_API_KEY : Platform.OS === 'ios' ? IOS_API_KEY : ANDROID_API_KEY;
  if (!apiKey) throw new Error('RevenueCat is not configured for this platform.');
  return apiKey;
}

let initialized = false;

export function initializeRevenueCat(): void {
  if (initialized) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: getApiKey() });
  initialized = true;
}

function useSubscriptionContext() {
  const queryClient = useQueryClient();
  const customerInfoQuery = useQuery({
    queryKey: ['revenuecat', 'customer-info'],
    queryFn: () => Purchases.getCustomerInfo(),
    staleTime: 60_000,
  });
  const offeringsQuery = useQuery({
    queryKey: ['revenuecat', 'offerings'],
    queryFn: () => Purchases.getOfferings(),
    staleTime: 300_000,
  });
  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: (customerInfo) => {
      queryClient.setQueryData(['revenuecat', 'customer-info'], customerInfo);
    },
  });
  const restoreMutation = useMutation({
    mutationFn: () => Purchases.restorePurchases(),
    onSuccess: (customerInfo) => {
      queryClient.setQueryData(['revenuecat', 'customer-info'], customerInfo);
    },
  });

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    isSubscribed: customerInfoQuery.data?.entitlements.active[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    error: customerInfoQuery.error ?? offeringsQuery.error,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  return <SubscriptionContext.Provider value={useSubscriptionContext()}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used within SubscriptionProvider');
  return context;
}