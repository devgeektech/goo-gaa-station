import { Stack } from 'expo-router';

export default function MenuStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Menu Categories' }} />
      <Stack.Screen
        name="product-list"
        options={({ route }) => ({
          title: (route.params as { categoryName?: string })?.categoryName ?? 'Products',
          headerBackTitle: 'Back',
        })}
      />
      <Stack.Screen name="add-product" options={{ title: 'Add New Product' }} />
      <Stack.Screen name="edit-product" options={{ title: 'Edit Product' }} />
    </Stack>
  );
}
