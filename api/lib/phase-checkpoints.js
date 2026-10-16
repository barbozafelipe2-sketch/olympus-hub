// A stage is saved only after a successful paid call. Never retry an AI call to
// repair a storage failure: account for it and stop before spending on the next stage.
export async function savePhaseCheckpoint(client, { ownerId, requestId, conversationId, stage, result }) {
  if (!conversationId) return false;
  const { error } = await client.from("ai_stage_checkpoints").upsert({
    owner_id: ownerId, request_id: requestId, conversation_id: conversationId,
    stage, provider: result.providerId, model: result.model,
    content: result.text.slice(0, 40000)
  }, { onConflict: "owner_id,request_id,stage" });
  if (error) throw Object.assign(new Error("Could not persist the completed AI stage."), { code: "CHECKPOINT_PERSISTENCE_FAILED" });
  return true;
}
