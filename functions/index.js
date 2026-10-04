const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const {
  onDocumentCreated
} = require("firebase-functions/v2/firestore");

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

/**
 * Send a push notification to all registered devices
 * belonging to a user.
 */
async function sendPushToUser(uid, notificationData) {
  if (!uid) return;

  const tokensSnapshot = await db
    .collection("users")
    .doc(uid)
    .collection("pushTokens")
    .get();

  if (tokensSnapshot.empty) {
    console.log("No registered push tokens for:", uid);
    return;
  }

  const tokenDocs = tokensSnapshot.docs;
  const tokens = tokenDocs
    .map(doc => doc.data().token)
    .filter(Boolean);

  if (!tokens.length) return;

  // Data-only messages allow the service worker
  // to display the notification exactly once.
  const response = await messaging.sendEachForMulticast({
    tokens,

    data: Object.fromEntries(
      Object.entries(notificationData).map(
        ([key, value]) => [key, String(value ?? "")]
      )
    ),

    webpush: {
      headers: {
        Urgency: "high"
      }
    }
  });

  // Remove tokens that are no longer valid.
  const deletions = [];

  response.responses.forEach((result, index) => {
    if (
      !result.success &&
      [
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token"
      ].includes(result.error?.code)
    ) {
      deletions.push(tokenDocs[index].ref.delete());
    }
  });

  await Promise.all(deletions);

  console.log(
    `Push sent to ${uid}: ${response.successCount} successful, ` +
    `${response.failureCount} failed`
  );
}

/**
 * PRIVATE CHAT NOTIFICATIONS
 *
 * Triggered whenever a new private message is created.
 */
exports.onPrivateMessageCreated = onDocumentCreated(
  {
    document: "chats/{chatId}/messages/{messageId}",
    region: "us-central1"
  },
  async event => {
    const message = event.data?.data();

    if (!message) return;

    const senderId = message.senderId;
    const receiverId = message.receiverId;
    const chatId = event.params.chatId;
    const messageId = event.params.messageId;

    // Do not notify the sender.
    if (!receiverId || receiverId === senderId) return;

    // Ignore unsupported message types.
    const type = message.type || "text";

    const senderName =
      message.senderName ||
      message.senderDisplayName ||
      "Someone";

    const text =
      type === "image"
        ? "📷 Sent you a photo"
        : (message.text || "Sent you a message");

    await sendPushToUser(receiverId, {
        type: "private_message",

        senderId,

        receiverId,

        senderName,

        message: text,

        messageId,

        chatId,

        url:
          `/chat.html?uid=${encodeURIComponent(senderId)}`
     });
  }
);

/**
 * GROUP CHAT NOTIFICATIONS
 *
 * Triggered whenever a new group message is created.
 */
exports.onGroupMessageCreated = onDocumentCreated(
  {
    document: "groups/{groupId}/groupMessages/{messageId}",
    region: "us-central1"
  },
  async event => {
    const message = event.data?.data();

    if (!message) return;

    const groupId = event.params.groupId;
    const messageId = event.params.messageId;
    const senderId = message.senderId;

    if (!senderId) return;

    const groupSnapshot = await db
      .collection("groups")
      .doc(groupId)
      .get();

    if (!groupSnapshot.exists) return;

    const group = groupSnapshot.data();

    const members = new Set([
      ...(Array.isArray(group.members) ? group.members : []),
      ...(Array.isArray(group.memberIds) ? group.memberIds : []),
      ...(group.ownerId ? [group.ownerId] : []),
      ...(group.createdBy ? [group.createdBy] : [])
    ]);

    // Do not notify users who are not group members.
    members.delete(senderId);

    if (!members.size) return;

    const groupName = group.name || group.groupName || "CONNECTA Group";

    const type = message.type || "text";

    const text =
      type === "image"
        ? "📷 Shared a photo"
        : (message.text || "Sent a message");

    // Send notifications to group members.
    await Promise.all(
      [...members].map(uid =>
        sendPushToUser(uid, {
          type: "group_message",
          senderId,
          senderName:
            message.senderName ||
            message.senderDisplayName ||
            "Someone",
          message: text,
          messageId,
          groupId,
          groupName,
          url: `/group-chat.html?groupId=${encodeURIComponent(groupId)}`
        })
      )
    );
  }
);
