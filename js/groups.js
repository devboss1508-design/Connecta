/* =========================================================
   CONNECTA — GROUPS
   File: frontend/js/groups.js

   GROUP RULES
   ---------------------------------------------------------
   PUBLIC GROUP
   - Visible to all users
   - Free to join
   - No verification required

   PRIVATE GROUP
   - Visible in approved group discovery
   - Verified users only
   - Joining fee required
   - Payment must be verified before membership is granted

   GROUP CREATION
   - Verified users only
   - New groups start as pending_review
   - Admin approval required before publication

   OWNER
   - Owner is automatically a member
   - Owner can open their approved group
   - Future owner controls:
       • Edit group
       • Change group photo
       • Delete group
       • Delete messages/photos
       • Lock messaging
       • Announcement-only mode

   REALTIME
   - Approved groups update live
   - My groups update live
   - Own profile/admin restrictions update live
   - Unread counts refresh automatically
========================================================= */

import {
  db
} from "./firebase.js";

import {
  getCurrentConnectaUser,
  logout
} from "./globalAuth.js";

import {
  doc,
  getDoc,
  getCountFromServer,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


/* =========================================================
   HELPERS
========================================================= */

const $ = id =>
  document.getElementById(id);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentProfile = null;
let currentAccountStatus = null;

let accountControlLoaded = false;

let allGroups = [];
let myGroups = [];

let stopApprovedGroups = null;
let stopMyGroups = null;
let stopOwnProfile = null;

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

  toast.classList.add("show");

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
   GROUP SLUG
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
   FULL PROFILE NAME
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
   GROUP TYPE BADGE
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
   GROUP JOIN FEE
========================================================= */

function subscriptionLabel(
  group
) {

  /*
   * PUBLIC GROUPS ARE ALWAYS FREE.
   */

  if (
    group.type !== "private"
  ) {

    return `
      <span class="group-badge">
        Free
      </span>
    `;
  }


  const fee =
    Number(
      group.subscriptionFee || 0
    );


  if (
    fee <= 0
  ) {

    return `
      <span class="group-badge paid">
        Fee Required
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
   ACCOUNT CONTROL
========================================================= */

function getGroupAccountControl(
  profile = null
) {

  if (
    !accountControlLoaded ||
    !profile
  ) {

    return {

      blocked: false,

      status:
        "checking",

      groupParticipationRestricted:
        true,

      message:
        "Checking your CONNECTA account permissions..."
    };
  }


  const status =
    String(
      profile.status ||
      "active"
    )
      .trim()
      .toLowerCase();


  const restricted =
    profile.groupParticipationRestricted ===
    true;


  if (
    status === "banned"
  ) {

    return {

      blocked: true,

      status,

      groupParticipationRestricted:
        true,

      message:
        "Your CONNECTA account is banned. Group participation is unavailable."
    };
  }


  if (
    status === "suspended"
  ) {

    return {

      blocked: true,

      status,

      groupParticipationRestricted:
        true,

      message:
        "Your CONNECTA account is suspended. Group participation is temporarily unavailable."
    };
  }


  if (
    restricted
  ) {

    return {

      blocked: false,

      status: "active",

      groupParticipationRestricted:
        true,

      message:
        "Group participation has been restricted by CONNECTA administration."
    };
  }


  return {

    blocked: false,

    status: "active",

    groupParticipationRestricted:
      false,

    message: ""
  };
}


/* =========================================================
   APPLY ACCOUNT CONTROL
========================================================= */

function applyGroupAccountControl() {

  const control =
    getGroupAccountControl(
      currentProfile
    );


  const createButton =
    $("createGroupBtn");


  if (createButton) {

    if (
      control.status === "checking"
    ) {

      createButton.disabled =
        true;

      createButton.title =
        "Checking account permissions";

    } else if (
      control.blocked ||
      control.groupParticipationRestricted
    ) {

      createButton.disabled =
        true;

      createButton.title =
        control.message;

    } else if (
      currentProfile?.isVerified !== true
    ) {

      createButton.disabled =
        false;

      createButton.title =
        "Only verified users can create groups";

    } else {

      createButton.disabled =
        false;

      createButton.title =
        "Create group";
    }
  }


  refreshGroupRenders();

  showGroupRestrictionNotice(
    control
  );
}


/* =========================================================
   ACCOUNT RESTRICTION NOTICE
========================================================= */

function showGroupRestrictionNotice(
  control
) {

  const existing =
    $("groupRestrictionNotice");


  if (
    !control ||
    (
      !control.blocked &&
      !control.groupParticipationRestricted &&
      control.status !== "checking"
    )
  ) {

    existing?.remove();

    return;
  }


  const target =
    $("groupsPage") ||
    $("groupsContainer") ||
    document.querySelector("main") ||
    document.body;


  if (!target) {
    return;
  }


  if (existing) {

    existing.innerHTML = `
      <span>🔒</span>
      <span>
        ${escapeHtml(
          control.message
        )}
      </span>
    `;

    return;
  }


  const notice =
    document.createElement("div");


  notice.id =
    "groupRestrictionNotice";


  notice.style.cssText = `
    margin:12px 16px;
    padding:12px 14px;
    border-radius:12px;
    background:#fff4e5;
    border:1px solid #ffd8a8;
    color:#8a4b00;
    font-size:13px;
    line-height:1.4;
    display:flex;
    align-items:center;
    gap:8px;
  `;


  notice.innerHTML = `
    <span>🔒</span>
    <span>
      ${escapeHtml(
        control.message
      )}
    </span>
  `;


  target.prepend(
    notice
  );
}


/* =========================================================
   REALTIME OWN PROFILE
========================================================= */

function listenToOwnProfile(
  uid
) {

  if (
    stopOwnProfile
  ) {

    stopOwnProfile();

    stopOwnProfile =
      null;
  }


  accountControlLoaded =
    false;


  const profileRef =
    doc(
      db,
      "users",
      uid
    );


  stopOwnProfile =
    onSnapshot(

      profileRef,

      snapshot => {

        if (
          !snapshot.exists()
        ) {

          accountControlLoaded =
            true;

          currentProfile = {

            uid,

            status:
              "suspended",

            groupParticipationRestricted:
              true,

            isVerified:
              false
          };


          applyGroupAccountControl();

          return;
        }


        currentProfile = {

          uid,

          ...snapshot.data()
        };


        currentAccountStatus =
          getGroupAccountControl(
            currentProfile
          );


        accountControlLoaded =
          true;


        renderHeaderProfile(
          currentProfile
        );


        applyGroupAccountControl();
      },

      error => {

        console.error(
          "Groups profile listener:",
          error
        );


        accountControlLoaded =
          true;


        currentProfile = {

          ...(currentProfile || {}),

          uid,

          groupParticipationRestricted:
            true
        };


        applyGroupAccountControl();


        showToast(
          "Could not verify your group permissions."
        );
      }
    );
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


  if (
    String(
      group.ownerId || ""
    ) ===
    String(
      currentUser.uid
    )
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
   CAN JOIN GROUP
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


  const control =
    getGroupAccountControl(
      currentProfile
    );


  if (
    control.status === "checking"
  ) {

    return {

      allowed: false,

      reason:
        control.message
    };
  }


  if (
    control.blocked
  ) {

    return {

      allowed: false,

      reason:
        control.message
    };
  }


  if (
    control.groupParticipationRestricted
  ) {

    return {

      allowed: false,

      reason:
        control.message
    };
  }


  if (
    group.status !== "approved"
  ) {

    return {

      allowed: false,

      reason:
        "This group has not been approved yet."
    };
  }


  /* -------------------------------------------------------
     PUBLIC GROUP
     ------------------------------------------------------- */

  if (
    group.type === "public"
  ) {

    return {

      allowed: true,

      requiresPayment:
        false
    };
  }


  /* -------------------------------------------------------
     PRIVATE GROUP
     ------------------------------------------------------- */

  if (
    group.type === "private"
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


    const fee =
      Number(
        group.subscriptionFee || 0
      );


    if (
      fee <= 0
    ) {

      return {

        allowed: false,

        reason:
          "This private group does not have a valid joining fee."
      };
    }


    return {

      allowed: true,

      requiresPayment:
        true
    };
  }


  return {

    allowed: false,

    reason:
      "Invalid group type."
  };
}


/* =========================================================
   TIMESTAMP
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
   GROUP TIME
========================================================= */

function formatGroupTime(
  value
) {

  const millis =
    getTimestampMillis(value);


  if (
    millis === null
  ) {

    return "";
  }


  const date =
    new Date(millis);


  const now =
    new Date();


  if (
    date.toDateString() ===
    now.toDateString()
  ) {

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
    days >= 0 &&
    days < 7
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
   LAST MESSAGE
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
    getUnreadCount(groupId);


  if (
    count <= 0
  ) {

    return "";
  }


  return `
    <span
      class="group-unread-badge"
      aria-label="${count} unread messages"
    >
      ${
        count > 99
          ? "99+"
          : count
      }
    </span>
  `;
}


/* =========================================================
   UNREAD CLASS
========================================================= */

function unreadClass(
  group
) {

  const groupId =
    group.groupId ||
    group.id ||
    "";


  return getUnreadCount(
    groupId
  ) > 0
    ? "has-unread"
    : "";
}


/* =========================================================
   GROUP CARD
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


  const groupId =
    group.groupId ||
    group.id ||
    "";


  let actionText =
    "Join";


  let actionClass =
    "";


  let disabled =
    false;


  /* -------------------------------------------------------
     OWNER
  ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     EXISTING MEMBER
  ------------------------------------------------------- */

  else if (
    member
  ) {

    actionText =
      "Open";

    actionClass =
      "secondary";


    if (
      access.allowed === false &&
      (
        access.reason?.includes("banned") ||
        access.reason?.includes("suspended") ||
        access.reason?.includes("restricted")
      )
    ) {

      actionText =
        "Locked";

      disabled =
        true;
    }
  }


  /* -------------------------------------------------------
     PRIVATE GROUP
  ------------------------------------------------------- */

  else if (
    group.type === "private"
  ) {

    if (
      currentProfile?.isVerified !== true
    ) {

      actionText =
        "Verify";

      actionClass =
        "secondary";

    } else {

      actionText =
        "Join";
    }
  }


  /* -------------------------------------------------------
     CANNOT JOIN
  ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     STATUS
  ------------------------------------------------------- */

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
              ).toLocaleString("en-KE")
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


        <div
          style="
            margin-top:7px;
            color:#9ca3af;
            font-size:10px;
          "
        >

          ${
            mine
              ? "Created by you"
              : `Created by ${escapeHtml(
                  creatorName
                )}`
          }

        </div>

      </div>


      <div class="group-action">

        <button
          type="button"
          class="${actionClass}"
          data-group-action="${escapeHtml(
            groupId
          )}"
          ${disabled ? "disabled" : ""}
        >
          ${actionText}
        </button>

      </div>

    </article>
  `;
}


/* =========================================================
   RENDER APPROVED GROUPS
   PUBLIC + PRIVATE
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


        if (!term) {
          return true;
        }


        const searchText =
          `${group.name || ""}
           ${group.description || ""}
           ${group.ownerName || ""}
           ${group.type || ""}`
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
              : "No approved groups yet."
          }
        </strong>

        <p>
          ${
            term
              ? "Try another search."
              : "Approved CONNECTA communities will appear here."
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


  attachGroupActions(box);
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


  attachGroupActions(box);
}


/* =========================================================
   REFRESH RENDERS
========================================================= */

function refreshGroupRenders() {

  const search =
    $("groupSearch")?.value ||
    "";


  renderPublicGroups(search);

  renderMyGroups(search);
}


/* =========================================================
   GROUP ACTIONS
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
                    String(
                      item.groupId ||
                      item.id ||
                      ""
                    ) ===
                    String(groupId)
                );


            if (!group) {

              showToast(
                "Group could not be found."
              );

              return;
            }


            button.disabled =
              true;


            try {

              await handleGroupAction(
                group
              );

            } finally {

              /*
               * Realtime snapshot will
               * re-render when necessary.
               */

              button.disabled =
                false;
            }
          }
        );
      }
    );
}


/* =========================================================
   HANDLE GROUP ACTION
========================================================= */

async function handleGroupAction(
  group
) {

  const control =
    getGroupAccountControl(
      currentProfile
    );


  if (
    control.status === "checking"
  ) {

    showToast(
      control.message
    );

    return;
  }


  if (
    control.blocked ||
    control.groupParticipationRestricted
  ) {

    showToast(
      control.message
    );

    return;
  }


  /* -------------------------------------------------------
     OWNER
  ------------------------------------------------------- */

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
        ? "This group is waiting for admin approval."
        : "This group cannot be opened."
    );

    return;
  }


  /* -------------------------------------------------------
     EXISTING MEMBER
  ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     PRIVATE PAID GROUP
  ------------------------------------------------------- */

  if (
    access.requiresPayment
  ) {

    await startPaidGroupJoin(
      group
    );

    return;
  }


  /* -------------------------------------------------------
     PUBLIC FREE GROUP
  ------------------------------------------------------- */

  await joinFreeGroup(
    group
  );
}


/* =========================================================
   JOIN PUBLIC FREE GROUP
========================================================= */

async function joinFreeGroup(
  group
) {

  if (!currentUser) {

    showToast(
      "Please log in first."
    );

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

        const groupSnap =
          await transaction.get(
            groupRef
          );


        const userSnap =
          await transaction.get(
            userRef
          );


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
            "Your CONNECTA account could not be found."
          );
        }


        const groupData =
          groupSnap.data();


        const userData =
          userSnap.data();


        /* -------------------------------------------------
           ACCOUNT CONTROL
        ------------------------------------------------- */

        const status =
          String(
            userData.status ||
            "active"
          )
            .trim()
            .toLowerCase();


        if (
          status === "banned"
        ) {

          throw new Error(
            "Your CONNECTA account is banned. You cannot join groups."
          );
        }


        if (
          status === "suspended"
        ) {

          throw new Error(
            "Your CONNECTA account is suspended. You cannot join groups."
          );
        }


        if (
          userData.groupParticipationRestricted ===
          true
        ) {

          throw new Error(
            "Group participation has been restricted by CONNECTA administration."
          );
        }


        /* -------------------------------------------------
           GROUP CONTROL
        ------------------------------------------------- */

        if (
          groupData.status !==
          "approved"
        ) {

          throw new Error(
            "This group is not approved."
          );
        }


        if (
          groupData.type !==
          "public"
        ) {

          throw new Error(
            "Private groups require verification and payment."
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
      450
    );


  } catch (error) {

    console.error(
      "Join public group error:",
      error
    );


    showToast(
      error.message ||
      "Could not join the group."
    );
  }
}


/* =========================================================
   PRIVATE GROUP PAYMENT
========================================================= */

async function startPaidGroupJoin(
  group
) {

  if (!currentUser) {
    return;
  }


  const control =
    getGroupAccountControl(
      currentProfile
    );


  if (
    control.status === "checking"
  ) {

    showToast(
      control.message
    );

    return;
  }


  if (
    control.blocked ||
    control.groupParticipationRestricted
  ) {

    showToast(
      control.message
    );

    return;
  }


  if (
    currentProfile?.isVerified !== true
  ) {

    showToast(
      "You must verify your CONNECTA account before joining a private group."
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
      "This private group has an invalid joining fee."
    );

    return;
  }


  /*
   * PAYMENT SECURITY
   *
   * Do NOT add the user to group.members here.
   *
   * The future backend/payment flow must:
   *
   * 1. Create payment request
   * 2. Verify payment
   * 3. Confirm transaction
   * 4. Add user to group
   * 5. Update memberCount
   *
   * This prevents users from bypassing
   * private-group joining fees.
   */

  showToast(
    `Private group joining fee: KSh ${fee.toLocaleString(
      "en-KE"
    )}. Payment checkout will open here.`
  );
}


/* =========================================================
   ONE GROUP UNREAD COUNT
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


  if (
    !group.lastMessageAt
  ) {

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


    const messagesRef =
      collection(
        db,
        GROUPS_COLLECTION,
        groupId,
        GROUP_MESSAGES_COLLECTION
      );


    if (
      !readSnap.exists()
    ) {

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

      const countSnapshot =
        await getCountFromServer(
          messagesRef
        );


      return Number(
        countSnapshot.data().count || 0
      );
    }


    const latestMillis =
      getTimestampMillis(
        group.lastMessageAt
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
      `Unread count failed for group ${groupId}:`,
      error
    );


    return 0;
  }
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


  if (
    !uniqueGroups.length
  ) {

    unreadCounts = {};

    refreshGroupRenders();

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


  if (
    token !==
    unreadRefreshToken
  ) {

    return;
  }


  unreadCounts = {};


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
          myGroups
        );

      },
      150
    );
}


/* =========================================================
   REALTIME APPROVED GROUPS
   ---------------------------------------------------------
   IMPORTANT:
   This now loads BOTH:
   - public approved groups
   - private approved groups

   Private groups are visible in discovery,
   but joining is restricted to verified users
   and requires the joining fee.
========================================================= */

function listenToApprovedGroups() {

  if (
    stopApprovedGroups
  ) {

    stopApprovedGroups();

    stopApprovedGroups =
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
      orderBy(
        "createdAt",
        "desc"
      )
    );


  stopApprovedGroups =
    onSnapshot(

      groupsQuery,

      snapshot => {

        allGroups =
          snapshot.docs.map(
            snap => ({

              id:
                snap.id,

              groupId:
                snap.id,

              ...snap.data()

            })
          );


        renderPublicGroups(
          $("groupSearch")?.value ||
          ""
        );


        /*
         * Badge shows the number of
         * approved available groups.
         */

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

      },

      error => {

        console.error(
          "Approved groups listener:",
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
                Please check your connection
                and Firestore configuration.
              </p>

            </div>
          `;
        }
      }
    );
}


/* =========================================================
   REALTIME MY GROUPS
========================================================= */

function listenToMyGroups() {

  if (
    stopMyGroups
  ) {

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
            snap => ({

              id:
                snap.id,

              groupId:
                snap.id,

              ...snap.data()

            })
          );


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
                Please check your Firestore
                rules or indexes.
              </p>

            </div>
          `;
        }
      }
    );
}


/* =========================================================
   CREATE GROUP MODAL
========================================================= */

function openCreateGroupModal() {

  const control =
    getGroupAccountControl(
      currentProfile
    );


  if (
    control.status === "checking"
  ) {

    showToast(
      control.message
    );

    return;
  }


  if (
    control.blocked ||
    control.groupParticipationRestricted
  ) {

    showToast(
      control.message
    );

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


  const modal =
    $("groupModal");


  if (!modal) {
    return;
  }


  modal.classList.add("open");


  modal.setAttribute(
    "aria-hidden",
    "false"
  );


  $("groupName")?.focus();


  updateGroupTypeRules();
}


/* =========================================================
   CLOSE CREATE GROUP MODAL
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
   GROUP TYPE RULES
   ---------------------------------------------------------
   Public  = FREE
   Private = PAID + VERIFIED
========================================================= */

function updateGroupTypeRules() {

  const type =
    document.querySelector(
      'input[name="groupType"]:checked'
    )?.value ||
    "public";


  const subscription =
    $("subscriptionEnabled");


  const feeInput =
    $("subscriptionFee");


  const subscriptionBox =
    $("subscriptionBox");


  if (
    type === "public"
  ) {

    /*
     * Public groups must always be free.
     */

    if (subscription) {

      subscription.value =
        "false";

      subscription.disabled =
        true;
    }


    if (feeInput) {

      feeInput.value =
        "";

      feeInput.required =
        false;

      feeInput.disabled =
        true;
    }


    subscriptionBox?.classList.remove(
      "show"
    );

    return;
  }


  /*
   * Private group.
   *
   * Private groups must have
   * a joining fee.
   */

  if (subscription) {

    subscription.value =
      "true";

    subscription.disabled =
      true;
  }


  if (subscriptionBox) {

    subscriptionBox.classList.add(
      "show"
    );
  }


  if (feeInput) {

    feeInput.disabled =
      false;

    feeInput.required =
      true;
  }
}


/* =========================================================
   OLD SUBSCRIPTION UI COMPATIBILITY
========================================================= */

function updateSubscriptionUI() {

  updateGroupTypeRules();
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


  const control =
    getGroupAccountControl(
      currentProfile
    );


  if (
    control.status === "checking"
  ) {

    showToast(
      control.message
    );

    return;
  }


  if (
    control.blocked ||
    control.groupParticipationRestricted
  ) {

    showToast(
      control.message
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


  /*
   * PUBLIC = FREE
   * PRIVATE = PAID
   */

  let subscriptionEnabled =
    false;


  let fee =
    0;


  if (
    type === "private"
  ) {

    subscriptionEnabled =
      true;


    fee =
      Number(
        $("subscriptionFee")?.value ||
        0
      );


    if (
      !Number.isFinite(fee) ||
      fee <= 0
    ) {

      showToast(
        "Enter a valid private-group joining fee."
      );

      return;
    }
  }


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


  const submitButton =
    $("submitGroupBtn");


  if (submitButton) {

    submitButton.disabled =
      true;

    submitButton.textContent =
      "Submitting...";
  }


  try {

    /*
     * Fresh profile check before creating.
     */

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


    const status =
      String(
        userData.status ||
        "active"
      )
        .trim()
        .toLowerCase();


    if (
      status === "banned"
    ) {

      throw new Error(
        "Your CONNECTA account is banned. You cannot create groups."
      );
    }


    if (
      status === "suspended"
    ) {

      throw new Error(
        "Your CONNECTA account is suspended. You cannot create groups."
      );
    }


    if (
      userData.groupParticipationRestricted ===
      true
    ) {

      throw new Error(
        "Group participation has been restricted by CONNECTA administration."
      );
    }


    if (
      userData.isVerified !== true
    ) {

      throw new Error(
        "Only verified CONNECTA users can create groups."
      );
    }


    /*
     * PRIVATE GROUP VALIDATION
     */

    if (
      type === "private" &&
      (
        !Number.isFinite(fee) ||
        fee <= 0
      )
    ) {

      throw new Error(
        "Private groups require a valid joining fee."
      );
    }


    /*
     * PUBLIC GROUPS CAN NEVER BE PAID.
     */

    if (
      type === "public"
    ) {

      subscriptionEnabled =
        false;

      fee =
        0;
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
        generateGroupSlug(name),

      description,

      photoURL:
        "",

      ownerId:
        currentUser.uid,

      ownerName:
        getFullName(userData),

      ownerUsername:
        userData.username ||
        "",

      ownerVerified:
        true,

      type,

      subscriptionEnabled,

      subscriptionFee:
        fee,

      /*
       * IMPORTANT:
       * New groups are not public
       * until admin approves them.
       */

      status:
        "pending_review",

      members: [
        currentUser.uid
      ],

      memberIds: [
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

      /*
       * Owner controls.
       *
       * These fields will be used by
       * group-chat.js and admin later.
       */

      chatLocked:
        false,

      announcementOnly:
        false,

      messagingLocked:
        false,

      deleted:
        false,

      /*
       * Latest message information.
       */

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


    updateGroupTypeRules();


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


  /*
   * Close menu after navigation.
   */

  sideMenu
    .querySelectorAll("a")
    .forEach(
      link => {

        link.addEventListener(
          "click",
          () => {

            if (
              link.dataset.coming
            ) {

              return;
            }

            closeMenu();
          }
        );
      }
    );
}


/* =========================================================
   HEADER PROFILE
========================================================= */

function renderHeaderProfile(
  profile
) {

  if (!profile) {
    return;
  }


  const name =
    getFullName(profile);


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

        await logout(true);

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

        renderMyGroups(value);

      } else {

        renderPublicGroups(value);
      }
    }
  );
}


/* =========================================================
   CREATE GROUP UI
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


  form?.addEventListener(
    "submit",
    createGroup
  );


  /*
   * Public/private type change.
   */

  document
    .querySelectorAll(
      'input[name="groupType"]'
    )
    .forEach(
      radio => {

        radio.addEventListener(
          "change",
          updateGroupTypeRules
        );
      }
    );


  updateGroupTypeRules();
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

  if (
    stopApprovedGroups
  ) {

    stopApprovedGroups();

    stopApprovedGroups =
      null;
  }


  if (
    stopMyGroups
  ) {

    stopMyGroups();

    stopMyGroups =
      null;
  }


  if (
    stopOwnProfile
  ) {

    stopOwnProfile();

    stopOwnProfile =
      null;
  }


  clearTimeout(
    unreadRefreshTimer
  );


  unreadRefreshToken++;
}


window.addEventListener(
  "beforeunload",
  cleanup
);


/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeGroups() {

  try {

    /*
     * CONNECTA centralized authentication.
     *
     * This recognizes the user who is already
     * logged in instead of creating another
     * authentication session.
     */

    const session =
      await getCurrentConnectaUser({

        redirect:
          true,

        allowBlocked:
          true
      });


    if (!session) {
      return;
    }


    currentUser =
      session.authUser;


    currentProfile =
      session.profile || {

        uid:
          currentUser.uid,

        status:
          "active"
      };


    currentAccountStatus =
      session.accountStatus;


    accountControlLoaded =
      true;


    /*
     * Render the user immediately from the
     * centralized session.
     */

    renderHeaderProfile(
      currentProfile
    );


    applyGroupAccountControl();


    /*
     * Continue listening for live profile
     * and admin changes.
     */

    listenToOwnProfile(
      currentUser.uid
    );


    /*
     * Approved public + private groups.
     */

    listenToApprovedGroups();


    /*
     * Groups where the current user is a member.
     */

    listenToMyGroups();


  } catch (error) {

    console.error(
      "CONNECTA Groups initialization error:",
      error
    );


    showToast(
      "Unable to load CONNECTA Groups."
    );
  }
}


/* =========================================================
   START UI
========================================================= */

setupMenu();

setupProfileButton();

setupLogout();

setupComingSoon();

setupSearch();

setupCreateGroup();

setupTabs();


/* =========================================================
   START CONNECTA GROUPS
========================================================= */

initializeGroups();
