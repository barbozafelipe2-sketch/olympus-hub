import { Redirect, Tabs } from "expo-router";
import { Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { C } from "@/ui";

const icons: Record<string, string> = {
  index: "⌂",
  projects: "▦",
  settings: "⚙",
};
export default function TabLayout() {
  const { session, loading, configured } = useAuth();
  if (loading) return null;
  if (!configured || !session) return <Redirect href="/auth" />;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          height: 78,
          paddingTop: 8,
          paddingBottom: 18,
          backgroundColor: C.surface,
          borderTopColor: C.line,
        },
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: C.dim,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarIcon: ({ color }) => (
          <View>
            <Text style={{ color, fontSize: 23, lineHeight: 25 }}>
              {icons[route.name] ?? "•"}
            </Text>
          </View>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="projects" options={{ title: "Projects" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
