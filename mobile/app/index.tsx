import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { C, BrandMark } from "@/ui";

export default function Index() {
  const { loading, session, configured } = useAuth();
  if (loading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          justifyContent: "center",
          alignItems: "center",
          gap: 18,
        }}
      >
        <BrandMark size={58} />
        <ActivityIndicator color={C.gold} />
        <Text style={{ color: C.muted }}>Restoring your workspace…</Text>
      </View>
    );
  return <Redirect href={!configured || !session ? "/auth" : "/(tabs)"} />;
}
