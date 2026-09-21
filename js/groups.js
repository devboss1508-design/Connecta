/* =========================================================
   CONNECTA — GROUPS
   File: frontend/js/groups.js

   FEATURES
   - Public groups
   - My groups
   - Group search
   - Create group
   - Verified-user group creation
   - Free group joining
   - Paid-group preparation
   - Group owner handling
   - Realtime group updates
   - Group latest-message preview
   - GROUP UNREAD COUNTS
   - Per-user read state
   - New-message badge
========================================================= */

import {
  auth,
  db
} from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getCountFromServer,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   BASIC HELPERS
========================================================= */

const $ = id =>
  document.getElementById(id);


let currentUser = null;
let currentProfile = null;

let allGroups = [];
let myGroups = [];

let stopPublicGroups = null;
let stopMyGroups = null;

let unreadCounts = {};

let unreadRefreshTimer = null;

let unreadRefreshToken = 0;


/* =========================================================
   COLLECTIONS
========================================================= */

const GROUPS_COLLECTION =
  "groups";

const GROUP_MESSAGES_COLLECTION =
  "groupMessages";

const GROUP_READS_COLLECTION =
  "reads";


/* =========================================================
   TOAST
========================================================= */

function showToast(message) {

  const toast =
    $("groupsToast");

  if (!toast) {
    return;
  }

  toast.textContent =
    String(message || "");

  toast.classList.add(
    "show"
  );

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      2600
    );
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[character])
    );
}


/* =========================================================
   INITIALS
========================================================= */

function initials(
  name = "G"
) {

  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      part =>
        part[0]
    )
    .join("")
    .toUpperCase() || "G";
}


/* =========================================================
   GROUP ID
========================================================= */

function generateGroupSlug(
  name
) {

  return String(name)
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(0, 60);
}


/* =========================================================
   PROFILE NAME
========================================================= */

function getFullName(
  profile = {}
) {

  const displayName =
    String(
      profile.displayName || ""
    ).trim();

  if (
    displayName &&
    displayName.toLowerCase() !==
      "connecta user"
  ) {

    return displayName;
  }

  const firstName =
    String(
      profile.firstName || ""
    ).trim();

  const lastName =
    String(
      profile.lastName || ""
    ).trim();

  const fullName =
    `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName;
  }

  const username =
    String(
      profile.username || ""
    )
      .trim()
      .replace(
        /^@/,
        ""
      );

  return username ||
    "CONNECTA User";
}


/* =========================================================
   VERIFIED BADGE
========================================================= */

function verifiedBadge(
  profile = {}
) {

  if (
    profile.isVerified !== true
  ) {

    return "";
  }

  return `
    <span
      style="
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:16px;
        height:16px;
        margin-left:3px;
        border-radius:50%;
        background:#2196F3;
        color:#ffffff;
        font-size:10px;
        font-weight:800;
        line-height:1;
        vertical-align:middle;
      "
      title="Verified account"
    >✓</span>
  `;
}


/* =========================================================
   GROUP AVATAR
========================================================= */

function groupAvatar(
  group
) {

  if (
    group.photoURL
  ) {

    return `
      <div class="group-avatar">

        <img
          src="${escapeHtml(
            group.photoURL
          )}"
          alt="${escapeHtml(
            group.name
          )}"
          loading="lazy"
        >

      </div>
    `;
  }

  return `
    <div class="group-avatar">
      ${initials(group.name)}
    </div>
  `;
}


/* =========================================================
   GROUP TYPE
========================================================= */

function groupTypeLabel(
  group
) {

  if (
    group.type === "private"
  ) {

    return `
      <span class="group-badge private">
        🔒 Private
      </span>
    `;
  }

  return `
    <span class="group-badge">
      🌍 Public
    </span>
  `;
}


/* =========================================================
   GROUP PAYMENT
========================================================= */

function subscriptionLabel(
  group
) {

  const enabled =
    group.subscriptionEnabled === true;

  const fee =
    Number(
      group.subscriptionFee || 0
    );

  if (
    !enabled ||
    fee <= 0
  ) {

    return `
      <span class="group-badge">
        Free
      </span>
    `;
  }

  return `
    <span class="group-badge paid">
      KSh ${fee.toLocaleString("en-KE")}
    </span>
  `;
}


/* =========================================================
   MEMBERSHIP
========================================================= */

function isMember(
  group
) {

  if (
    !currentUser ||
    !group
  ) {

    return false;
  }

  /*
   * Owner is always treated as a member.
   */
  if (
    String(group.ownerId || "") ===
    String(currentUser.uid)
  ) {

    return true;
  }

  const members =
    Array.isArray(
      group.members
    )
      ? group.members
      : Array.isArray(
          group.memberIds
        )
        ? group.memberIds
        : [];

  return members.includes(
    currentUser.uid
  );
}


/* =========================================================
   CAN JOIN
========================================================= */

function canJoinGroup(
  group
) {

  if (!currentUser) {

    return {
      allowed: false,
      reason:
        "Please log in first."
    };
  }

  if (
    group.status !==
    "approved"
  ) {

    return {
      allowed: false,
      reason:
        "This group has not been approved yet."
    };
  }

  if (
    group.type ===
    "public"
  ) {

    return {
      allowed: true,

      requiresPayment:
        group.subscriptionEnabled === true &&
        Number(
          group.subscriptionFee || 0
        ) > 0
    };
  }

  if (
    group.type ===
    "private"
  ) {

    if (
      currentProfile?.isVerified !== true
    ) {

      return {
        allowed: false,
        reason:
          "Only verified CONNECTA users can join private groups."
      };
    }

    return {
      allowed: true,

      requiresPayment:
        group.subscriptionEnabled === true &&
        Number(
          group.subscriptionFee || 0
        ) > 0
    };
  }

  return {
    allowed: false,
    reason:
      "Invalid group type."
  };
}


/* =========================================================
   FORMAT LAST MESSAGE TIME
========================================================= */

function formatGroupTime(
  value
) {

  if (!value) {
    return "";
  }

  let date = null;

  if (
    typeof value?.toDate ===
    "function"
  ) {

    date =
      value.toDate();

  } else if (
    value?.seconds
  ) {

    date =
      new Date(
        value.seconds * 1000
      );

  } else if (
    value?._seconds
  ) {

    date =
      new Date(
        value._seconds * 1000
      );

  } else {

    date =
      new Date(value);
  }

  if (
    !date ||
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";
  }

  const now =
    new Date();

  const sameDay =
    date.toDateString() ===
    now.toDateString();

  if (sameDay) {

    return date.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  }

  const difference =
    now.getTime() -
    date.getTime();

  const days =
    Math.floor(
      difference /
      86400000
    );

  if (
    days < 7 &&
    days >= 0
  ) {

    return date.toLocaleDateString(
      [],
      {
        weekday: "short"
      }
    );
  }

  return date.toLocaleDateString(
    [],
    {
      day: "numeric",
      month: "short"
    }
  );
}


/* =========================================================
   LATEST MESSAGE PREVIEW
========================================================= */

function groupLastMessage(
  group
) {

  const text =
    String(
      group.lastMessage || ""
    ).trim();

  if (!text) {

    return `
      <span class="group-last-message-empty">
        No messages yet
      </span>
    `;
  }

  return escapeHtml(
    text
  );
}


/* =========================================================
   UNREAD COUNT
========================================================= */

function getUnreadCount(
  groupId
) {

  return Number(
    unreadCounts[groupId] || 0
  );
}


/* =========================================================
   UNREAD BADGE
========================================================= */

function unreadBadge(
  group
) {

  const groupId =
    String(
      group.groupId ||
      group.id ||
      ""
    );

  const count =
    getUnreadCount(
      groupId
    );

  if (count <= 0) {
    return "";
  }

  const display =
    count > 99
      ? "99+"
      : String(count);

  return `
    <span
      class="group-unread-badge"
      aria-label="${count} unread messages"
    >
      ${display}
    </span>
  `;
}


/* =========================================================
   UNREAD CLASS
========================================================= */

function unreadClass(
  group
) {

  return getUnreadCount(
    group.groupId ||
    group.id ||
    ""
  ) > 0
    ? "has-unread"
    : "";
}


/* =========================================================
   RENDER GROUP CARD
========================================================= */

function renderGroupCard(
  group,
  options = {}
) {

  const mine =
    options.mine === true;

  const member =
    isMember(group);

  const access =
    canJoinGroup(group);

  let actionText =
    "Join";

  let actionClass =
    "";

  let disabled =
    false;

  /*
   * Creator.
   */

  if (
    group.ownerId ===
    currentUser?.uid
  ) {

    if (
      group.status ===
      "pending_review"
    ) {

      actionText =
        "Pending";

      actionClass =
        "secondary";

      disabled =
        true;

    } else if (
      group.status ===
      "rejected"
    ) {

      actionText =
        "Rejected";

      actionClass =
        "secondary";

      disabled =
        true;

    } else {

      actionText =
        "Open";

      actionClass =
        "secondary";
    }
  }

  /*
   * Existing member.
   */

  else if (
    member
  ) {

    actionText =
      "Open";

    actionClass =
      "secondary";
  }

  /*
   * Cannot join.
   */

  else if (
    !access.allowed
  ) {

    actionText =
      "Locked";

    actionClass =
      "secondary";

    disabled =
      true;
  }

  /*
   * Paid group.
   */

  else if (
    access.requiresPayment
  ) {

    actionText =
      "Join";
  }


  const statusBadge =
    group.status ===
    "pending_review"

      ? `
        <span class="group-badge pending-badge">
          Pending Review
        </span>
      `

      : group.status ===
        "rejected"

        ? `
          <span class="group-badge private">
            Rejected
          </span>
        `

        : "";


  const creatorName =
    group.ownerName ||
    "CONNECTA User";


  const groupId =
    group.groupId ||
    group.id ||
    "";


  return `
    <article
      class="
        group-card
        ${group.status === "pending_review"
          ? "pending-group"
          : ""}
        ${unreadClass(group)}
      "
      data-group-id="${escapeHtml(
        groupId
      )}"
    >

      ${groupAvatar(group)}

      <div class="group-content">

        <div class="group-name-row">

          <h3 class="group-name">

            ${escapeHtml(
              group.name ||
              "CONNECTA Group"
            )}

          </h3>

          ${unreadBadge(group)}

        </div>


        <p class="group-description">

          ${escapeHtml(
            group.description ||
            "CONNECTA community"
          )}

        </p>


        ${
          group.lastMessage
            ? `
              <div
                class="group-last-message"
                style="
                  margin-top:5px;
                  font-size:11px;
                  color:#6b7280;
                  display:flex;
                  align-items:center;
                  gap:5px;
                "
              >

                <span
                  style="
                    overflow:hidden;
                    text-overflow:ellipsis;
                    white-space:nowrap;
                    max-width:75%;
                    ${
                      getUnreadCount(groupId) > 0
                        ? "font-weight:700;color:#111827;"
                        : ""
                    }
                  "
                >
                  ${groupLastMessage(group)}
                </span>

                ${
                  group.lastMessageAt
                    ? `
                      <span
                        style="
                          flex-shrink:0;
                          font-size:9px;
                          color:#9ca3af;
                        "
                      >
                        ${escapeHtml(
                          formatGroupTime(
                            group.lastMessageAt
                          )
                        )}
                      </span>
                    `
                    : ""
                }

              </div>
            `
            : ""
        }


        <div class="group-meta">

          ${groupTypeLabel(group)}

          ${subscriptionLabel(group)}

          ${statusBadge}

          <span class="group-members">

            ${
              Number(
                group.memberCount || 0
              ).toLocaleString(
                "en-KE"
              )
            }

            ${
              Number(
                group.memberCount || 0
              ) === 1
                ? "member"
                : "members"
            }

          </span>

        </div>


        ${
          mine
            ? `
              <div
                style="
                  margin-top:7px;
                  color:#9ca3af;
                  font-size:10px;
                "
              >
                Created by you
              </div>
            `
            : `
              <div
                style="
                  margin-top:7px;
                  color:#9ca3af;
                  font-size:10px;
                "
              >
                Created by
                ${escapeHtml(
                  creatorName
                )}
              </div>
            `
        }

      </div>


      <div class="group-action">

        <button
          type="button"
          class="${actionClass}"
          data-group-action="${escapeHtml(
            groupId
          )}"
          ${
            disabled
              ? "disabled"
              : ""
          }
        >
          ${actionText}
        </button>

      </div>

    </article>
  `;
}


/* =========================================================
   RENDER PUBLIC GROUPS
========================================================= */

function renderPublicGroups(
  filter = ""
) {

  const box =
    $("publicGroups");

  if (!box) {
    return;
  }

  const term =
    String(filter || "")
      .trim()
      .toLowerCase();

  const groups =
    allGroups.filter(
      group => {

        if (
          group.status !==
          "approved"
        ) {

          return false;
        }

        if (
          group.type !==
          "public"
        ) {

          return false;
        }

        if (!term) {
          return true;
        }

        const searchText =
          `${group.name || ""}
           ${group.description || ""}
           ${group.ownerName || ""}`
            .toLowerCase();

        return searchText.includes(
          term
        );
      }
    );


  const count =
    $("publicGroupCount");

  if (count) {

    count.textContent =
      `${groups.length} ${
        groups.length === 1
          ? "group"
          : "groups"
      }`;
  }


  if (!groups.length) {

    box.innerHTML = `
      <div class="groups-empty">

        <div class="groups-empty-icon">
          👥
        </div>

        <strong>
          ${
            term
              ? "No groups found."
              : "No public groups yet."
          }
        </strong>

        <p>
          ${
            term
              ? "Try another search."
              : "Approved public communities will appear here."
          }
        </p>

      </div>
    `;

    return;
  }


  box.innerHTML =
    groups
      .map(
        group =>
          renderGroupCard(group)
      )
      .join("");


  attachGroupActions(
    box
  );
}


/* =========================================================
   RENDER MY GROUPS
========================================================= */

function renderMyGroups(
  filter = ""
) {

  const box =
    $("myGroups");

  if (!box) {
    return;
  }

  const term =
    String(filter || "")
      .trim()
      .toLowerCase();

  const groups =
    myGroups.filter(
      group => {

        if (!term) {
          return true;
        }

        const searchText =
          `${group.name || ""}
           ${group.description || ""}`
            .toLowerCase();

        return searchText.includes(
          term
        );
      }
    );


  const count =
    $("myGroupCount");

  if (count) {

    count.textContent =
      `${groups.length} ${
        groups.length === 1
          ? "group"
          : "groups"
      }`;
  }


  if (!groups.length) {

    box.innerHTML = `
      <div class="groups-empty">

        <div class="groups-empty-icon">
          👥
        </div>

        <strong>
          ${
            term
              ? "No groups found."
              : "You haven't joined any groups yet."
          }
        </strong>

        <p>
          ${
            term
              ? "Try another search."
              : "Groups you join or create will appear here."
          }
        </p>

      </div>
    `;

    return;
  }


  box.innerHTML =
    groups
      .map(
        group =>
          renderGroupCard(
            group,
            {
              mine: true
            }
          )
      )
      .join("");


  attachGroupActions(
    box
  );
}


/* =========================================================
   REFRESH ALL GROUP RENDERS
========================================================= */

function refreshGroupRenders() {

  const search =
    $("groupSearch")?.value ||
    "";

  renderPublicGroups(
    search
  );

  renderMyGroups(
    search
  );
}


/* =========================================================
   GROUP ACTION HANDLERS
========================================================= */

function attachGroupActions(
  container
) {

  container
    .querySelectorAll(
      "[data-group-action]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            const groupId =
              button.dataset.groupAction;

            if (!groupId) {
              return;
            }

            const group =
              [...allGroups, ...myGroups]
                .find(
                  item =>
                    (
                      item.groupId ||
                      item.id
                    ) ===
                    groupId
                );

            if (!group) {

              showToast(
                "Group could not be found."
              );

              return;
            }

            await handleGroupAction(
              group
            );
          }
        );
      }
    );
}


/* =========================================================
   GROUP ACTION
========================================================= */

async function handleGroupAction(
  group
) {

  if (
    group.ownerId ===
    currentUser?.uid
  ) {

    if (
      group.status ===
      "approved"
    ) {

      location.href =
        `group-chat.html?groupId=${encodeURIComponent(
          group.groupId
        )}`;

      return;
    }

    showToast(
      group.status ===
      "pending_review"
        ? "This group is waiting for admin review."
        : "This group cannot be opened."
    );

    return;
  }


  if (
    isMember(group)
  ) {

    location.href =
      `group-chat.html?groupId=${encodeURIComponent(
        group.groupId
      )}`;

    return;
  }


  const access =
    canJoinGroup(group);

  if (
    !access.allowed
  ) {

    showToast(
      access.reason
    );

    return;
  }


  if (
    access.requiresPayment
  ) {

    await startPaidGroupJoin(
      group
    );

    return;
  }


  await joinFreeGroup(
    group
  );
}


/* =========================================================
   JOIN FREE GROUP
========================================================= */

async function joinFreeGroup(
  group
) {

  if (!currentUser) {
    return;
  }

  try {

    const groupRef =
      doc(
        db,
        GROUPS_COLLECTION,
        group.groupId
      );

    const userRef =
      doc(
        db,
        "users",
        currentUser.uid
      );

    await runTransaction(
      db,
      async transaction => {

        const [
          groupSnap,
          userSnap
        ] = await Promise.all([
          transaction.get(
            groupRef
          ),
          transaction.get(
            userRef
          )
        ]);

        if (
          !groupSnap.exists()
        ) {

          throw new Error(
            "Group no longer exists."
          );
        }

        if (
          !userSnap.exists()
        ) {

          throw new Error(
            "Your account could not be found."
          );
        }

        const groupData =
          groupSnap.data();

        const userData =
          userSnap.data();

        if (
          groupData.status !==
          "approved"
        ) {

          throw new Error(
            "This group is not approved."
          );
        }

        if (
          groupData.type ===
          "private" &&
          userData.isVerified !== true
        ) {

          throw new Error(
            "Only verified users can join private groups."
          );
        }

        if (
          groupData.subscriptionEnabled ===
            true &&
          Number(
            groupData.subscriptionFee || 0
          ) > 0
        ) {

          throw new Error(
            "This group requires payment."
          );
        }

        const members =
          Array.isArray(
            groupData.members
          )
            ? [
                ...groupData.members
              ]
            : [];

        if (
          members.includes(
            currentUser.uid
          )
        ) {

          return;
        }

        members.push(
          currentUser.uid
        );

        transaction.update(
          groupRef,
          {

            members,

            memberCount:
              members.length,

            updatedAt:
              serverTimestamp()
          }
        );
      }
    );


    showToast(
      "You joined the group."
    );


    setTimeout(
      () => {

        location.href =
          `group-chat.html?groupId=${encodeURIComponent(
            group.groupId
          )}`;

      },
      500
    );


  } catch (error) {

    console.error(
      "Join group error:",
      error
    );

    showToast(
      error.message ||
      "Could not join group."
    );
  }
}


/* =========================================================
   PAID GROUP JOIN
========================================================= */

async function startPaidGroupJoin(
  group
) {

  if (
    group.type ===
    "private" &&
    currentProfile?.isVerified !== true
  ) {

    showToast(
      "You must verify your CONNECTA account first."
    );

    return;
  }


  const fee =
    Number(
      group.subscriptionFee || 0
    );


  if (
    fee <= 0
  ) {

    showToast(
      "Invalid subscription fee."
    );

    return;
  }


  /*
   * Payment backend will be connected here.
   */

  showToast(
    `Subscription required: KSh ${fee.toLocaleString(
      "en-KE"
    )}. Payment checkout will open next.`
  );
}


/* =========================================================
   UNREAD COUNT — ONE GROUP
========================================================= */

async function getGroupUnreadCount(
  group
) {

  if (
    !currentUser ||
    !group
  ) {

    return 0;
  }


  const groupId =
    String(
      group.groupId ||
      group.id ||
      ""
    );


  if (!groupId) {
    return 0;
  }


  /*
   * The group must have a newer message than
   * the user's last-read timestamp before we
   * perform the count query.
   */

  const lastMessageAt =
    group.lastMessageAt;


  if (!lastMessageAt) {
    return 0;
  }


  try {

    const readRef =
      doc(
        db,
        GROUPS_COLLECTION,
        groupId,
        GROUP_READS_COLLECTION,
        currentUser.uid
      );


    const readSnap =
      await getDoc(
        readRef
      );


    /*
     * No read record means the user has never
     * opened this group.
     *
     * If there is a latest message, count
     * the messages currently in the group.
     */

    if (
      !readSnap.exists()
    ) {

      const messagesRef =
        collection(
          db,
          GROUPS_COLLECTION,
          groupId,
          GROUP_MESSAGES_COLLECTION
        );

      const countSnapshot =
        await getCountFromServer(
          messagesRef
        );

      return Number(
        countSnapshot.data().count || 0
      );
    }


    const readData =
      readSnap.data();


    const lastReadAt =
      readData.lastReadAt;


    if (!lastReadAt) {

      const messagesRef =
        collection(
          db,
          GROUPS_COLLECTION,
          groupId,
          GROUP_MESSAGES_COLLECTION
        );

      const countSnapshot =
        await getCountFromServer(
          messagesRef
        );

      return Number(
        countSnapshot.data().count || 0
      );
    }


    /*
     * If the latest group message is not newer
     * than lastReadAt, there are no unread messages.
     *
     * This is an optimization to avoid a count query.
     */

    const latestMillis =
      getTimestampMillis(
        lastMessageAt
      );

    const readMillis =
      getTimestampMillis(
        lastReadAt
      );


    if (
      latestMillis !== null &&
      readMillis !== null &&
      latestMillis <= readMillis
    ) {

      return 0;
    }


    /*
     * Exact unread count.
     */

    const messagesRef =
      collection(
        db,
        GROUPS_COLLECTION,
        groupId,
        GROUP_MESSAGES_COLLECTION
      );


    const unreadQuery =
      query(
        messagesRef,
        where(
          "createdAt",
          ">",
          lastReadAt
        )
      );


    const countSnapshot =
      await getCountFromServer(
        unreadQuery
      );


    return Number(
      countSnapshot.data().count || 0
    );


  } catch (error) {

    console.warn(
      `Could not calculate unread count for group ${groupId}:`,
      error
    );

    return 0;
  }
}


/* =========================================================
   TIMESTAMP TO MILLISECONDS
========================================================= */

function getTimestampMillis(
  value
) {

  if (!value) {
    return null;
  }


  try {

    if (
      typeof value.toMillis ===
      "function"
    ) {

      return value.toMillis();
    }


    if (
      typeof value.toDate ===
      "function"
    ) {

      return value.toDate().getTime();
    }


    if (
      typeof value.seconds ===
      "number"
    ) {

      return (
        value.seconds * 1000 +
        Math.floor(
          Number(
            value.nanoseconds || 0
          ) / 1000000
        )
      );
    }


    if (
      typeof value._seconds ===
      "number"
    ) {

      return (
        value._seconds * 1000 +
        Math.floor(
          Number(
            value._nanoseconds || 0
          ) / 1000000
        )
      );
    }


    const date =
      new Date(value);


    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {

      return date.getTime();
    }

  } catch {
    /* ignore */
  }


  return null;
}


/* =========================================================
   REFRESH UNREAD COUNTS
========================================================= */

async function refreshUnreadCounts(
  groups
) {

  if (
    !currentUser ||
    !Array.isArray(groups)
  ) {

    return;
  }


  const uniqueGroups =
    Array.from(
      new Map(
        groups
          .filter(
            group =>
              group &&
              (
                group.groupId ||
                group.id
              )
          )
          .map(
            group => [
              group.groupId ||
              group.id,
              group
            ]
          )
      ).values()
    );


  if (!uniqueGroups.length) {
    return;
  }


  const token =
    ++unreadRefreshToken;


  const results =
    await Promise.all(
      uniqueGroups.map(
        async group => {

          const id =
            group.groupId ||
            group.id;

          const count =
            await getGroupUnreadCount(
              group
            );

          return {
            id,
            count
          };
        }
      )
    );


  /*
   * Ignore old results if another refresh
   * started while this one was running.
   */

  if (
    token !==
    unreadRefreshToken
  ) {

    return;
  }


  results.forEach(
    result => {

      unreadCounts[
        result.id
      ] =
        result.count;

    }
  );


  refreshGroupRenders();
}


/* =========================================================
   SCHEDULE UNREAD REFRESH
========================================================= */

function scheduleUnreadRefresh() {

  clearTimeout(
    unreadRefreshTimer
  );

  unreadRefreshTimer =
    setTimeout(
      () => {

        refreshUnreadCounts(
          [
            ...allGroups,
            ...myGroups
          ]
        );

      },
      150
    );
}


/* =========================================================
   LOAD PUBLIC GROUPS
========================================================= */

function listenToPublicGroups() {

  if (stopPublicGroups) {

    stopPublicGroups();

    stopPublicGroups =
      null;
  }


  const groupsQuery =
    query(
      collection(
        db,
        GROUPS_COLLECTION
      ),
      where(
        "status",
        "==",
        "approved"
      ),
      where(
        "type",
        "==",
        "public"
      ),
      orderBy(
        "createdAt",
        "desc"
      )
    );


  stopPublicGroups =
    onSnapshot(

      groupsQuery,

      snapshot => {

        allGroups =
          snapshot.docs.map(
            snap => {

              return {

                id:
                  snap.id,

                groupId:
                  snap.id,

                ...snap.data()
              };
            }
          );


        renderPublicGroups(
          $("groupSearch")?.value ||
          ""
        );


        const badge =
          $("groupBadge");


        if (badge) {

          badge.textContent =
            String(
              allGroups.length
            );

          badge.hidden =
            allGroups.length === 0;
        }


        scheduleUnreadRefresh();
      },

      error => {

        console.error(
          "Public groups listener:",
          error
        );


        const box =
          $("publicGroups");


        if (box) {

          box.innerHTML = `
            <div class="groups-empty">

              <div class="groups-empty-icon">
                ⚠️
              </div>

              <strong>
                Could not load groups.
              </strong>

              <p>
                Check your Firestore rules and indexes.
              </p>

            </div>
          `;
        }
      }
    );
}


/* =========================================================
   LOAD MY GROUPS
========================================================= */

function listenToMyGroups() {

  if (stopMyGroups) {

    stopMyGroups();

    stopMyGroups =
      null;
  }


  const groupsQuery =
    query(
      collection(
        db,
        GROUPS_COLLECTION
      ),
      where(
        "members",
        "array-contains",
        currentUser.uid
      ),
      orderBy(
        "updatedAt",
        "desc"
      )
    );


  stopMyGroups =
    onSnapshot(

      groupsQuery,

      snapshot => {

        myGroups =
          snapshot.docs.map(
            snap => {

              return {

                id:
                  snap.id,

                groupId:
                  snap.id,

                ...snap.data()
              };
            }
          );


        /*
         * Merge public and personal groups
         * without duplicate group IDs.
         */

        const map =
          new Map();


        [
          ...allGroups,
          ...myGroups
        ].forEach(
          group => {

            map.set(
              group.groupId ||
              group.id,
              group
            );
          }
        );


        allGroups =
          [
            ...map.values()
          ];


        renderMyGroups(
          $("groupSearch")?.value ||
          ""
        );


        scheduleUnreadRefresh();
      },

      error => {

        console.error(
          "My groups listener:",
          error
        );


        const box =
          $("myGroups");


        if (box) {

          box.innerHTML = `
            <div class="groups-empty">

              <div class="groups-empty-icon">
                ⚠️
              </div>

              <strong>
                My Groups could not load.
              </strong>

              <p>
                Check your Firestore rules or required index.
              </p>

            </div>
          `;
        }
      }
    );
}


/* =========================================================
   OPEN CREATE MODAL
========================================================= */

function openCreateGroupModal() {

  const modal =
    $("groupModal");

  if (!modal) {
    return;
  }


  if (
    currentProfile?.isVerified !== true
  ) {

    showToast(
      "Only verified CONNECTA users can create groups."
    );

    return;
  }


  modal.classList.add(
    "open"
  );

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  $("groupName")?.focus();
}


/* =========================================================
   CLOSE CREATE MODAL
========================================================= */

function closeCreateGroupModal() {

  const modal =
    $("groupModal");

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "open"
  );

  modal.setAttribute(
    "aria-hidden",
    "true"
  );
}


/* =========================================================
   SUBSCRIPTION UI
========================================================= */

function updateSubscriptionUI() {

  const enabled =
    $("subscriptionEnabled")?.value ===
    "true";

  const box =
    $("subscriptionBox");

  if (!box) {
    return;
  }

  box.classList.toggle(
    "show",
    enabled
  );

  const feeInput =
    $("subscriptionFee");

  if (feeInput) {

    feeInput.required =
      enabled;
  }
}


/* =========================================================
   CREATE GROUP
========================================================= */

async function createGroup(
  event
) {

  event.preventDefault();


  if (!currentUser) {

    showToast(
      "Please log in first."
    );

    return;
  }


  if (
    currentProfile?.isVerified !== true
  ) {

    showToast(
      "Your CONNECTA account must be verified before creating a group."
    );

    return;
  }


  const name =
    $("groupName")?.value
      .trim() || "";


  const description =
    $("groupDescription")?.value
      .trim() || "";


  const type =
    document.querySelector(
      'input[name="groupType"]:checked'
    )?.value ||
    "public";


  const subscriptionEnabled =
    $("subscriptionEnabled")?.value ===
    "true";


  const fee =
    Number(
      $("subscriptionFee")?.value ||
      0
    );


  if (
    name.length < 3
  ) {

    showToast(
      "Group name must be at least 3 characters."
    );

    return;
  }


  if (
    name.length > 80
  ) {

    showToast(
      "Group name is too long."
    );

    return;
  }


  if (
    description.length < 5
  ) {

    showToast(
      "Please provide a group description."
    );

    return;
  }


  if (
    subscriptionEnabled &&
    (
      !Number.isFinite(fee) ||
      fee <= 0
    )
  ) {

    showToast(
      "Enter a valid subscription fee."
    );

    return;
  }


  const submitButton =
    $("submitGroupBtn");


  if (submitButton) {

    submitButton.disabled =
      true;

    submitButton.textContent =
      "Submitting...";
  }


  try {

    const userSnap =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );


    if (
      !userSnap.exists()
    ) {

      throw new Error(
        "Your CONNECTA profile could not be found."
      );
    }


    const userData =
      userSnap.data();


    if (
      userData.isVerified !== true
    ) {

      throw new Error(
        "Only verified CONNECTA users can create groups."
      );
    }


    const groupRef =
      doc(
        collection(
          db,
          GROUPS_COLLECTION
        )
      );


    const groupData = {

      groupId:
        groupRef.id,

      name,

      slug:
        generateGroupSlug(
          name
        ),

      description,

      photoURL:
        "",

      ownerId:
        currentUser.uid,

      ownerName:
        getFullName(
          userData
        ),

      ownerUsername:
        userData.username ||
        "",

      ownerVerified:
        true,

      type,

      subscriptionEnabled,

      subscriptionFee:
        subscriptionEnabled
          ? fee
          : 0,

      status:
        "pending_review",

      members: [
        currentUser.uid
      ],

      memberCount:
        1,

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp(),

      approvedAt:
        null,

      approvedBy:
        null,

      rejectedAt:
        null,

      rejectedBy:
        null,

      rejectionReason:
        "",

      lastMessageId:
        "",

      lastMessage:
        "",

      lastMessageSenderId:
        "",

      lastMessageSenderName:
        "",

      lastMessageAt:
        null

    };


    await runTransaction(
      db,
      async transaction => {

        transaction.set(
          groupRef,
          groupData
        );
      }
    );


    closeCreateGroupModal();

    $("createGroupForm")?.reset();


    const publicRadio =
      $("publicGroup");

    if (publicRadio) {
      publicRadio.checked =
        true;
    }


    const subscription =
      $("subscriptionEnabled");

    if (subscription) {

      subscription.value =
        "false";
    }


    updateSubscriptionUI();


    showToast(
      "Group submitted for admin review."
    );


    switchTab(
      "mine"
    );


  } catch (error) {

    console.error(
      "Create group error:",
      error
    );


    showToast(
      error.message ||
      "Could not create group."
    );

  } finally {

    if (submitButton) {

      submitButton.disabled =
        false;

      submitButton.textContent =
        "Submit for Review";
    }
  }
}


/* =========================================================
   TAB SWITCHING
========================================================= */

function switchTab(
  tab
) {

  const discoverTab =
    $("discoverTab");

  const myGroupsTab =
    $("myGroupsTab");

  const discoverSection =
    $("discoverSection");

  const mineSection =
    $("mineSection");


  if (
    tab === "mine"
  ) {

    discoverTab?.classList.remove(
      "active"
    );

    myGroupsTab?.classList.add(
      "active"
    );

    if (discoverSection) {
      discoverSection.hidden =
        true;
    }

    if (mineSection) {
      mineSection.hidden =
        false;
    }


    renderMyGroups(
      $("groupSearch")?.value ||
      ""
    );

  } else {

    myGroupsTab?.classList.remove(
      "active"
    );

    discoverTab?.classList.add(
      "active"
    );

    if (mineSection) {
      mineSection.hidden =
        true;
    }

    if (discoverSection) {
      discoverSection.hidden =
        false;
    }


    renderPublicGroups(
      $("groupSearch")?.value ||
      ""
    );
  }
}


/* =========================================================
   MENU
========================================================= */

function setupMenu() {

  const menuBtn =
    $("menuBtn");

  const sideMenu =
    $("sideMenu");

  const overlay =
    $("menuOverlay");


  if (
    !menuBtn ||
    !sideMenu ||
    !overlay
  ) {

    return;
  }


  menuBtn.addEventListener(
    "click",
    () => {

      sideMenu.classList.add(
        "open"
      );

      sideMenu.setAttribute(
        "aria-hidden",
        "false"
      );

      overlay.classList.add(
        "open"
      );
    }
  );


  overlay.addEventListener(
    "click",
    closeMenu
  );


  function closeMenu() {

    sideMenu.classList.remove(
      "open"
    );

    sideMenu.setAttribute(
      "aria-hidden",
      "true"
    );

    overlay.classList.remove(
      "open"
    );
  }
}


/* =========================================================
   PROFILE HEADER
========================================================= */

function renderHeaderProfile(
  profile
) {

  if (!profile) {
    return;
  }


  const name =
    getFullName(
      profile
    );


  const username =
    profile.username
      ? `@${String(
          profile.username
        ).replace(/^@/, "")}`
      : "@username";


  const initial =
    initials(name);


  const photo =
    profile.photoURL ||
    "";


  const balance =
    Number(
      profile.balance || 0
    );


  const balanceAmount =
    $("balanceAmount");


  if (balanceAmount) {

    balanceAmount.textContent =
      balance.toLocaleString(
        "en-KE",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      );
  }


  const profileBtn =
    $("profileBtn");


  if (profileBtn) {

    profileBtn.innerHTML =
      photo

        ? `
          <img
            src="${escapeHtml(photo)}"
            alt="${escapeHtml(name)}"
          >
        `

        : initial;
  }


  const menuAvatar =
    $("menuAvatar");


  if (menuAvatar) {

    menuAvatar.innerHTML =
      photo

        ? `
          <img
            src="${escapeHtml(photo)}"
            alt="${escapeHtml(name)}"
          >
        `

        : initial;
  }


  const menuName =
    $("menuName");


  if (menuName) {

    menuName.innerHTML =
      `${escapeHtml(name)}
       ${verifiedBadge(profile)}`;
  }


  const menuUsername =
    $("menuUsername");


  if (menuUsername) {

    menuUsername.textContent =
      username;
  }
}


/* =========================================================
   PROFILE BUTTON
========================================================= */

function setupProfileButton() {

  const button =
    $("profileBtn");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    () => {

      if (!currentUser) {
        return;
      }


      location.href =
        `profile.html?uid=${encodeURIComponent(
          currentUser.uid
        )}`;
    }
  );
}


/* =========================================================
   LOGOUT
========================================================= */

function setupLogout() {

  const button =
    $("logoutBtn");


  if (!button) {
    return;
  }


  button.addEventListener(
    "click",
    async () => {

      button.disabled =
        true;


      try {

        await signOut(
          auth
        );


        location.replace(
          "login.html"
        );


      } catch (error) {

        console.error(
          "Logout error:",
          error
        );


        button.disabled =
          false;


        showToast(
          "Could not log out."
        );
      }
    }
  );
}


/* =========================================================
   COMING SOON
========================================================= */

function setupComingSoon() {

  document
    .querySelectorAll(
      "[data-coming]"
    )
    .forEach(
      element => {

        element.addEventListener(
          "click",
          event => {

            event.preventDefault();


            showToast(
              `${element.dataset.coming} is coming in the next module.`
            );
          }
        );
      }
    );
}


/* =========================================================
   SEARCH
========================================================= */

function setupSearch() {

  const input =
    $("groupSearch");


  if (!input) {
    return;
  }


  input.addEventListener(
    "input",
    event => {

      const value =
        event.target.value;


      if (
        $("discoverSection")?.hidden
      ) {

        renderMyGroups(
          value
        );

      } else {

        renderPublicGroups(
          value
        );
      }
    }
  );
}


/* =========================================================
   CREATE GROUP MODAL UI
========================================================= */

function setupCreateGroup() {

  const openButton =
    $("createGroupBtn");

  const closeButton =
    $("closeGroupModal");

  const cancelButton =
    $("cancelGroupBtn");

  const modal =
    $("groupModal");

  const form =
    $("createGroupForm");

  const subscription =
    $("subscriptionEnabled");


  openButton?.addEventListener(
    "click",
    openCreateGroupModal
  );


  closeButton?.addEventListener(
    "click",
    closeCreateGroupModal
  );


  cancelButton?.addEventListener(
    "click",
    closeCreateGroupModal
  );


  modal?.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        modal
      ) {

        closeCreateGroupModal();
      }
    }
  );


  subscription?.addEventListener(
    "change",
    updateSubscriptionUI
  );


  form?.addEventListener(
    "submit",
    createGroup
  );


  updateSubscriptionUI();
}


/* =========================================================
   TABS
========================================================= */

function setupTabs() {

  $("discoverTab")?.addEventListener(
    "click",
    () => {

      switchTab(
        "discover"
      );
    }
  );


  $("myGroupsTab")?.addEventListener(
    "click",
    () => {

      switchTab(
        "mine"
      );
    }
  );
}


/* =========================================================
   CLEANUP
========================================================= */

function cleanup() {

  if (stopPublicGroups) {

    stopPublicGroups();

    stopPublicGroups =
      null;
  }


  if (stopMyGroups) {

    stopMyGroups();

    stopMyGroups =
      null;
  }


  clearTimeout(
    unreadRefreshTimer
  );
}


window.addEventListener(
  "beforeunload",
  cleanup
);


/* =========================================================
   AUTH
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      location.replace(
        "login.html"
      );

      return;
    }


    currentUser =
      user;


    try {

      const userSnap =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );


      if (
        !userSnap.exists()
      ) {

        throw new Error(
          "CONNECTA profile not found."
        );
      }


      currentProfile =
        {
          uid: user.uid,
          ...userSnap.data()
        };


      renderHeaderProfile(
        currentProfile
      );


      listenToPublicGroups();

      listenToMyGroups();


    } catch (error) {

      console.error(
        "Groups initialization error:",
        error
      );


      showToast(
        "Could not load your CONNECTA profile."
      );
    }
  }
);


/* =========================================================
   INITIALIZE UI
========================================================= */

setupMenu();

setupProfileButton();

setupLogout();

setupComingSoon();

setupSearch();

setupCreateGroup();

setupTabs();
