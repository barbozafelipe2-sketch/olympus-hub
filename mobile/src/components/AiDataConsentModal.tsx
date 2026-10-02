import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Button, C } from "@/ui";

const privacyPolicyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim();

export function AiDataConsentModal({
  visible,
  onAccept,
  onDismiss,
}: {
  visible: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 18,
          backgroundColor: "#000B",
        }}
      >
        <View
          style={{
            maxHeight: "90%",
            backgroundColor: C.surface,
            borderColor: C.line,
            borderWidth: 1,
            borderRadius: 24,
            overflow: "hidden",
          }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 22, gap: 14 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              accessibilityRole="header"
              style={{ color: C.gold, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 }}
            >
              YOUR CHOICE
            </Text>
            <Text style={{ color: C.text, fontSize: 23, lineHeight: 28, fontWeight: "800" }}>
              Allow AI providers to process your request?
            </Text>
            <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}>
              When you use an AI feature, OlyHub sends your prompt and relevant
              conversation context to the provider or providers used for that
              request. In a Project, this can include relevant saved memories
              and text from files you ask OlyHub to analyze. Your account data
              and saved workspace are also stored by OlyHub to provide the app.
            </Text>
            <View style={{ gap: 8 }}>
              <Text style={{ color: C.text, fontWeight: "800" }}>
                Providers OlyHub may use
              </Text>
              <Text style={{ color: C.muted, lineHeight: 20 }}>
                OpenAI, Anthropic (Claude), and Google (Gemini). Zeus may route
                a request to one provider and use OpenAI as a fallback.
                Olympus may send relevant context to multiple providers for its
                council. Web research and image generation may also use OpenAI.
              </Text>
            </View>
            <Text style={{ color: C.dim, fontSize: 12, lineHeight: 18 }}>
              OlyHub does not send your prompt to an AI provider until you allow
              it here. You can decline and continue using non-AI parts of the
              app. You can withdraw this device’s consent later in Settings;
              AI requests will then pause until you allow them again.
            </Text>
            {privacyPolicyUrl?.startsWith("https://") ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(privacyPolicyUrl)}
                style={{ alignSelf: "flex-start", paddingVertical: 4 }}
              >
                <Text style={{ color: C.gold, fontWeight: "700" }}>
                  Read OlyHub’s Privacy Policy
                </Text>
              </Pressable>
            ) : (
              <Text style={{ color: C.red, fontSize: 12, lineHeight: 18 }}>
                Privacy Policy URL is not configured in this build. It must be
                set before App Store release.
              </Text>
            )}
            <Button title="Allow AI processing & continue" onPress={onAccept} />
            <Button title="Not now" kind="secondary" onPress={onDismiss} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
