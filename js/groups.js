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

   INDEX-SAFE VERSION
   ---------------------------------------------------------
   - Does NOT use orderBy() together with where()
   - Firestore results are sorted client-side
   - Avoids unnecessary composite-index requirements
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


function canJoinGroup(group) {

  if (!currentUser) {

    return {
      allowed: false,
      reason: "Please log in first."
    };
  }


  const control =
    getGroupAccountControl(
      currentProfile
    );


  if (control.status === "checking") {

    return {
      allowed: false,
      reason: control.message
    };
  }


  if (control.blocked) {

    return {
      allowed: false,
      reason: control.message
    };
  }


  if (control.groupParticipationRestricted) {

    return {
      allowed: false,
      reason: control.message
    };
  }


  if (group.status !== "approved") {

    return {
      allowed: false,
      reason: "This group has not been approved yet."
    };
  }


  /* =======================================================
     PUBLIC GROUP
  ======================================================= */

  if (group.type === "public") {

    return {
      allowed: true,
      requiresVerification: false,
      requiresPayment: false,
      fee: 0
    };
  }


  /* =======================================================
     PRIVATE GROUP
  ======================================================= */

  if (group.type === "private") {

    const fee =
      Number(
        group.subscriptionFee || 0
      );


    return {
      allowed: true,
      requiresVerification:
        currentProfile?.isVerified !== true,

      requiresPayment:
        fee > 0,

      fee:
        fee > 0 ? fee : 0
    };
  }


  return {
    allowed: false,
    reason: "Invalid group type."
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
   SORT GROUPS BY DATE
   ---------------------------------------------------------
   Firestore no longer performs orderBy().
   We sort safely on the client instead.
========================================================= */

function sortGroupsByDate(
  groups,
  field = "createdAt"
) {

  return [
    ...groups
  ].sort(
    (a, b) => {

      const aTime =
        getTimestampMillis(
          a?.[field]
        ) || 0;


      const bTime =
        getTimestampMillis(
          b?.[field]
        ) || 0;


      return bTime - aTime;
    }
  );
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
    sortGroupsByDate(
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
      ),
      "createdAt"
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
    sortGroupsByDate(
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
      ),
      "updatedAt"
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


  /* -------------------------------------------------------
     CHECK JOIN PERMISSION
  ------------------------------------------------------- */

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


  /* =======================================================
     PRIVATE GROUP
  ======================================================= */

  if (
    group.type === "private"
  ) {

    /*
     * PRIVATE GROUPS REQUIRE A VERIFIED ACCOUNT.
     */

    if (
      access.requiresVerification
    ) {

      await startPrivateGroupVerification(
        group
      );

      return;
    }


    /*
     * VERIFIED USER
     *
     * Now process the private-group
     * joining payment.
     */

    if (
      access.requiresPayment &&
      access.fee > 0
    ) {

      await startPaidGroupJoin(
        group
      );

      return;
    }


    /*
     * This should normally not happen because
     * private groups are created with a fee.
     *
     * Keep this fallback for data safety.
     */

    showToast(
      "This private group does not have a valid joining fee."
    );

    return;
  }


  /* =======================================================
     PUBLIC FREE GROUP
  ======================================================= */

  if (
    group.type === "public"
  ) {

    await joinFreeGroup(
      group
    );

    return;
  }


  /* -------------------------------------------------------
     INVALID GROUP TYPE
  ------------------------------------------------------- */

  showToast(
    "Invalid group type."
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

            memberIds:
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
   PRIVATE GROUP VERIFICATION
   ---------------------------------------------------------
   PRIVATE GROUPS REQUIRE A VERIFIED ACCOUNT.

   FLOW:

   JOIN
     ↓
   NOT VERIFIED
     ↓
   VERIFICATION POPUP
     ↓
   M-PESA PHONE
     ↓
   STK PUSH — KSh 999
     ↓
   PAYMENT CONFIRMED
     ↓
   CHECK GROUP JOINING FEE
========================================================= */

async function startPrivateGroupVerification(
  group
) {

  if (!currentUser) {
    return;
  }


  const confirmed =
    await showVerificationRequiredModal(
      group
    );


  if (!confirmed) {
    return;
  }


  const phone =
    await showMpesaPhoneModal(
      "Verify Your CONNECTA Account",
      "Enter your M-PESA phone number to receive an STK Push.",
      999,
      "Pay KSh 999 & Verify"
    );


  if (!phone) {
    return;
  }


  try {

    showToast(
      "Sending verification STK Push..."
    );


    const firebaseUser =
      currentUser;


    const token =
      await firebaseUser.getIdToken(
        true
      );


    const response =
      await fetch(
        "https://connecta-backend-com.onrender.com/api/verification/initiate",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`
          },

          body:
            JSON.stringify({
              phone
            })
        }
      );


    const data =
      await response.json()
        .catch(
          () => ({})
        );


    if (!response.ok) {

      throw new Error(
        data.message ||
        data.error ||
        "Could not start verification payment."
      );
    }


    /*
     * Backend should return a payment reference
     * / checkout request ID.
     */

    const checkoutRequestId =
      data.checkout_request_id ||
      data.checkoutRequestId ||
      data.reference ||
      data.transaction_id ||
      data.transactionId;


    if (!checkoutRequestId) {

      throw new Error(
        "Verification payment was started, but no payment reference was returned."
      );
    }


    showToast(
      "STK Push sent. Enter your M-PESA PIN."
    );


    const paid =
      await pollVerificationPayment(
        checkoutRequestId,
        token
      );


    if (!paid) {

      return;
    }


    showToast(
      "Account verified successfully."
    );


    /*
     * Refresh the current user's profile.
     */

    await refreshCurrentGroupProfile();


    /*
     * If the group requires a joining fee,
     * continue directly to the group payment.
     */

    const fee =
      Number(
        group.subscriptionFee || 0
      );


    if (
      fee > 0
    ) {

      setTimeout(
        () => {

          startPaidGroupJoin(
            group
          );

        },
        500
      );

      return;
    }


    /*
     * Verified private group with no fee.
     */

    await joinFreeGroup(
      group
    );


  } catch (error) {

    console.error(
      "Private group verification error:",
      error
    );


    showToast(
      error.message ||
      "Verification payment could not be completed."
    );
  }
}

/* =========================================================
   VERIFICATION REQUIRED MODAL
========================================================= */

function showVerificationRequiredModal(
  group
) {

  return new Promise(
    resolve => {

      const existing =
        document.getElementById(
          "connectaGroupPaymentModal"
        );


      existing?.remove();


      const modal =
        document.createElement("div");


      modal.id =
        "connectaGroupPaymentModal";


      modal.style.cssText = `
        position:fixed;
        inset:0;
        z-index:9000;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        background:rgba(15,23,42,.58);
        backdrop-filter:blur(4px);
      `;


      modal.innerHTML = `
        <div
          style="
            width:100%;
            max-width:390px;
            background:#ffffff;
            border-radius:24px;
            padding:23px;
            box-shadow:0 20px 60px rgba(0,0,0,.22);
          "
        >

          <div
            style="
              width:55px;
              height:55px;
              margin:0 auto 13px;
              display:grid;
              place-items:center;
              border-radius:50%;
              background:#ecfdf5;
              color:#16a34a;
              font-size:25px;
            "
          >
            ✓
          </div>

          <h3
            style="
              margin:0;
              text-align:center;
              color:#14532d;
              font-size:19px;
              font-weight:900;
            "
          >
            Verification Required
          </h3>

          <p
            style="
              margin:9px 0 0;
              text-align:center;
              color:#6b7280;
              font-size:12px;
              line-height:1.55;
            "
          >
            Your CONNECTA account must be verified
            before you can join
            <strong>
              ${escapeHtml(
                group?.name ||
                "this private group"
              )}
            </strong>.
          </p>

          <div
            style="
              margin-top:15px;
              padding:12px;
              border-radius:14px;
              background:#f0fdf4;
              border:1px solid #bbf7d0;
              color:#166534;
              font-size:11px;
              line-height:1.5;
            "
          >
            Account verification requires a
            one-time payment of
            <strong>KSh 999</strong>.
          </div>

          <div
            style="
              display:flex;
              gap:9px;
              margin-top:18px;
            "
          >

            <button
              id="groupVerifyCancel"
              type="button"
              style="
                flex:1;
                min-height:46px;
                border:1px solid #d1d5db;
                border-radius:13px;
                background:#ffffff;
                color:#374151;
                font-weight:900;
                cursor:pointer;
              "
            >
              Cancel
            </button>

            <button
              id="groupVerifyNow"
              type="button"
              style="
                flex:1;
                min-height:46px;
                border:0;
                border-radius:13px;
                background:#22c55e;
                color:#ffffff;
                font-weight:900;
                cursor:pointer;
              "
            >
              Verify Now
            </button>

          </div>

        </div>
      `;


      document.body.appendChild(
        modal
      );


      const finish =
        value => {

          modal.remove();

          resolve(value);
        };


      modal
        .querySelector(
          "#groupVerifyCancel"
        )
        ?.addEventListener(
          "click",
          () => finish(false)
        );


      modal
        .querySelector(
          "#groupVerifyNow"
        )
        ?.addEventListener(
          "click",
          () => finish(true)
        );


      modal.addEventListener(
        "click",
        event => {

          if (
            event.target === modal
          ) {

            finish(false);
          }
        }
      );
    }
  );
}

/* =========================================================
   M-PESA PHONE MODAL
========================================================= */

function showMpesaPhoneModal(
  title,
  description,
  amount,
  submitText
) {

  return new Promise(
    resolve => {

      document
        .getElementById(
          "connectaGroupPaymentModal"
        )
        ?.remove();


      const modal =
        document.createElement("div");


      modal.id =
        "connectaGroupPaymentModal";


      modal.style.cssText = `
        position:fixed;
        inset:0;
        z-index:9000;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        background:rgba(15,23,42,.58);
        backdrop-filter:blur(4px);
      `;


      modal.innerHTML = `
        <div
          style="
            width:100%;
            max-width:390px;
            background:#ffffff;
            border-radius:24px;
            padding:23px;
            box-shadow:0 20px 60px rgba(0,0,0,.22);
          "
        >

          <h3
            style="
              margin:0;
              color:#14532d;
              font-size:19px;
              font-weight:900;
            "
          >
            ${escapeHtml(title)}
          </h3>

          <p
            style="
              margin:8px 0 16px;
              color:#6b7280;
              font-size:12px;
              line-height:1.55;
            "
          >
            ${escapeHtml(description)}
          </p>

          <div
            style="
              margin-bottom:13px;
              padding:12px;
              border-radius:13px;
              background:#f0fdf4;
              color:#166534;
              font-size:12px;
              font-weight:900;
              text-align:center;
            "
          >
            Amount:
            KSh ${Number(amount).toLocaleString("en-KE")}
          </div>

          <label
            style="
              display:block;
              margin-bottom:7px;
              color:#374151;
              font-size:12px;
              font-weight:900;
            "
          >
            M-PESA Phone Number
          </label>

          <input
            id="groupPaymentPhone"
            type="tel"
            inputmode="numeric"
            autocomplete="tel"
            placeholder="07XXXXXXXX"
            maxlength="13"
            style="
              width:100%;
              min-height:48px;
              padding:0 13px;
              border:1px solid #d1d5db;
              border-radius:13px;
              outline:none;
              font-size:14px;
              box-sizing:border-box;
            "
          >

          <p
            style="
              margin:7px 0 0;
              color:#9ca3af;
              font-size:10px;
            "
          >
            You will receive an STK Push on this number.
          </p>

          <div
            style="
              display:flex;
              gap:9px;
              margin-top:18px;
            "
          >

            <button
              id="groupPaymentCancel"
              type="button"
              style="
                flex:1;
                min-height:46px;
                border:1px solid #d1d5db;
                border-radius:13px;
                background:#ffffff;
                color:#374151;
                font-weight:900;
              "
            >
              Cancel
            </button>

            <button
              id="groupPaymentSubmit"
              type="button"
              style="
                flex:1;
                min-height:46px;
                border:0;
                border-radius:13px;
                background:#22c55e;
                color:#ffffff;
                font-weight:900;
              "
            >
              ${escapeHtml(submitText)}
            </button>

          </div>

        </div>
      `;


      document.body.appendChild(
        modal
      );


      const input =
        modal.querySelector(
          "#groupPaymentPhone"
        );


      const finish =
        value => {

          modal.remove();

          resolve(value);
        };


      modal
        .querySelector(
          "#groupPaymentCancel"
        )
        ?.addEventListener(
          "click",
          () => finish(null)
        );


      modal
        .querySelector(
          "#groupPaymentSubmit"
        )
        ?.addEventListener(
          "click",
          () => {

            const raw =
              String(
                input?.value || ""
              ).trim();


            const digits =
              raw.replace(
                /\D/g,
                ""
              );


            let normalized =
              digits;


            if (
              normalized.startsWith(
                "0"
              )
            ) {

              normalized =
                "254" +
                normalized.slice(1);

            } else if (
              normalized.startsWith(
                "+"
              )
            ) {

              normalized =
                normalized.replace(
                  /^\+/,
                  ""
                );
            }


            if (
              !/^2547\d{8}$/.test(
                normalized
              )
            ) {

              input?.focus();

              showToast(
                "Enter a valid Kenyan M-PESA number."
              );

              return;
            }


            finish(
              normalized
            );
          }
        );


      input?.focus();


      modal.addEventListener(
        "click",
        event => {

          if (
            event.target === modal
          ) {

            finish(null);
          }
        }
      );
    }
  );
}

/* =========================================================
   REFRESH CURRENT GROUP PROFILE
========================================================= */

async function refreshCurrentGroupProfile() {

  if (!currentUser) {
    return;
  }


  try {

    const snapshot =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );


    if (
      snapshot.exists()
    ) {

      currentProfile = {
        uid:
          currentUser.uid,

        ...snapshot.data()
      };


      renderHeaderProfile(
        currentProfile
      );


      applyGroupAccountControl();
    }

  } catch (error) {

    console.warn(
      "Could not refresh CONNECTA profile:",
      error
    );
  }
}


/* =========================================================
   VERIFICATION PAYMENT POLLING
========================================================= */

async function pollVerificationPayment(
  checkoutRequestId,
  token
) {

  const maxAttempts =
    30;


  const delay =
    2000;


  for (
    let attempt = 0;
    attempt < maxAttempts;
    attempt++
  ) {

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          delay
        )
    );


    try {

      const response =
        await fetch(
          "https://connecta-backend-com.onrender.com/api/verification/status",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${token}`
            },

            body:
              JSON.stringify({
                checkout_request_id:
                  checkoutRequestId
              })
          }
        );


      const data =
        await response.json()
          .catch(
            () => ({})
          );


      if (!response.ok) {

        throw new Error(
          data.message ||
          data.error ||
          "Could not check payment status."
        );
      }


      const status =
        String(
          data.status ||
          data.payment_status ||
          ""
        )
          .toLowerCase();


      if (
        [
          "completed",
          "success",
          "successful",
          "paid"
        ].includes(
          status
        )
      ) {

        return true;
      }


      if (
        [
          "failed",
          "cancelled",
          "canceled",
          "rejected",
          "timeout",
          "expired"
        ].includes(
          status
        )
      ) {

        showToast(
          "Verification payment was not completed."
        );

        return false;
      }


      if (
        attempt ===
        maxAttempts - 1
      ) {

        showToast(
          "Payment is taking longer than expected. Please check your verification status."
        );

        return false;
      }

    } catch (error) {

      console.error(
        "Verification status error:",
        error
      );


      if (
        attempt ===
        maxAttempts - 1
      ) {

        showToast(
          error.message ||
          "Could not confirm verification payment."
        );

        return false;
      }
    }
  }


  return false;
}

/* =========================================================
   PAYMENT PROCESSING MODAL
   ---------------------------------------------------------
   Stays visible while M-PESA payment is being confirmed.
========================================================= */

function showPaymentProcessingModal(
  title = "Processing Payment",
  message = "Waiting for M-PESA payment confirmation..."
) {

  document
    .getElementById(
      "connectaPaymentProcessingModal"
    )
    ?.remove();


  const modal =
    document.createElement("div");


  modal.id =
    "connectaPaymentProcessingModal";


  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:99999;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    background:rgba(15,23,42,.62);
    backdrop-filter:blur(5px);
  `;


  modal.innerHTML = `
    <div
      style="
        width:100%;
        max-width:370px;
        background:#ffffff;
        border-radius:24px;
        padding:28px 22px;
        text-align:center;
        box-shadow:0 25px 70px rgba(0,0,0,.28);
      "
    >

      <div
        style="
          width:72px;
          height:72px;
          margin:0 auto 18px;
          border-radius:50%;
          background:#ecfdf5;
          display:flex;
          align-items:center;
          justify-content:center;
        "
      >

        <div
          style="
            width:42px;
            height:42px;
            border:4px solid #bbf7d0;
            border-top-color:#22c55e;
            border-radius:50%;
            animation:connectaPaymentSpin .85s linear infinite;
          "
        ></div>

      </div>


      <h3
        style="
          margin:0;
          color:#14532d;
          font-size:20px;
          font-weight:900;
        "
      >
        ${escapeHtml(title)}
      </h3>


      <p
        id="connectaPaymentProcessingMessage"
        style="
          margin:10px 0 0;
          color:#6b7280;
          font-size:13px;
          line-height:1.55;
        "
      >
        ${escapeHtml(message)}
      </p>


      <div
        style="
          margin-top:18px;
          padding:12px 13px;
          border-radius:14px;
          background:#f0fdf4;
          border:1px solid #bbf7d0;
          color:#166534;
          font-size:11px;
          line-height:1.5;
        "
      >
        Please complete the M-PESA payment on your phone.
        <br>
        <strong>Do not close this page.</strong>
      </div>

    </div>
  `;


  document.body.appendChild(
    modal
  );


  /*
   * Add spinner animation once.
   */

  if (
    !document.getElementById(
      "connectaPaymentSpinnerStyle"
    )
  ) {

    const style =
      document.createElement("style");


    style.id =
      "connectaPaymentSpinnerStyle";


    style.textContent = `
      @keyframes connectaPaymentSpin {
        from {
          transform:rotate(0deg);
        }

        to {
          transform:rotate(360deg);
        }
      }
    `;


    document.head.appendChild(
      style
    );
  }
}


/* =========================================================
   UPDATE PAYMENT PROCESSING MESSAGE
========================================================= */

function updatePaymentProcessingMessage(
  message
) {

  const messageElement =
    document.getElementById(
      "connectaPaymentProcessingMessage"
    );


  if (messageElement) {

    messageElement.textContent =
      String(message || "");
  }
}


/* =========================================================
   CLOSE PAYMENT PROCESSING MODAL
========================================================= */

function closePaymentProcessingModal() {

  document
    .getElementById(
      "connectaPaymentProcessingModal"
    )
    ?.remove();
}
   
/* =========================================================
   PRIVATE GROUP PAYMENT
   ---------------------------------------------------------
   FLOW:

   VERIFIED USER
        ↓
   JOIN
        ↓
   M-PESA PHONE
        ↓
   BACKEND JOIN PAYMENT
        ↓
   OPTIMAPAY STK PUSH
        ↓
   USER ENTERS M-PESA PIN
        ↓
   PAYMENT PROCESSING MODAL
        ↓
   POLL PAYMENT STATUS
        ↓
   BACKEND CONFIRMS PAYMENT
        ↓
   BACKEND ADDS USER TO GROUP
        ↓
   SUCCESS MESSAGE
        ↓
   OPEN GROUP CHAT

   IMPORTANT:
   - Frontend NEVER adds the user to group.members
     for paid groups.
   - Membership is granted only by the backend after
     payment confirmation.
========================================================= */

async function startPaidGroupJoin(
  group
) {

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


  /*
   * Private groups require verification.
   */

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
    !Number.isFinite(fee) ||
    fee <= 0
  ) {

    showToast(
      "This private group has an invalid joining fee."
    );

    return;
  }


  /*
   * Ask for M-PESA number.
   */

  const phone =
    await showMpesaPhoneModal(
      "Join Private Group",
      `Enter your M-PESA phone number to pay the KSh ${fee.toLocaleString(
        "en-KE"
      )} joining fee for ${group.name || "this group"}.`,
      fee,
      "Pay & Join Group"
    );


  if (!phone) {
    return;
  }


  /*
   * Start payment.
   */

  showToast(
    "Starting group payment..."
  );


  try {

    /*
     * Get a fresh Firebase ID token.
     */

    const token =
      await currentUser.getIdToken(
        true
      );


    /*
     * Start the payment.
     *
     * Backend:
     * POST /api/groups/:groupId/join-payment
     */

    const initiateResponse =
      await fetch(
        `https://connecta-backend-com.onrender.com/api/groups/${encodeURIComponent(
          group.groupId
        )}/join-payment`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`
          },

          body:
            JSON.stringify({
              phone
            })
        }
      );


    const initiateData =
      await initiateResponse
        .json()
        .catch(
          () => ({})
        );


    if (
      !initiateResponse.ok
    ) {

      throw new Error(
        initiateData.message ||
        initiateData.error ||
        "Could not start the group payment."
      );
    }


    /*
     * Backend creates:
     *
     * groupPayments/{paymentId}
     */

    const paymentId =
      initiateData.paymentId ||
      initiateData.payment_id;


    if (!paymentId) {

      throw new Error(
        "Payment was started, but no payment ID was returned."
      );
    }


    /*
     * =====================================================
     * PAYMENT PROCESSING MODAL
     * =====================================================
     *
     * This replaces the temporary toast.
     *
     * The modal remains visible while the backend
     * checks the M-PESA payment.
     */

    showPaymentProcessingModal(
      "Payment Processing",
      "Waiting for M-PESA payment confirmation..."
    );


    /*
     * =====================================================
     * POLL BACKEND
     * =====================================================
     *
     * We NEVER call OptimaPay directly from the browser.
     *
     * The backend:
     * 1. Checks OptimaPay
     * 2. Confirms payment
     * 3. Adds the user to the group
     * 4. Updates memberCount
     * 5. Marks groupPayments completed
     */

    const result =
      await pollPaidGroupJoinPayment(
        group,
        paymentId,
        token
      );


    /*
     * =====================================================
     * PAYMENT NOT COMPLETED
     * =====================================================
     */

    if (
      !result
    ) {

      closePaymentProcessingModal();

      return;
    }


    /*
     * =====================================================
     * PAYMENT SUCCESS
     * =====================================================
     *
     * At this point the backend has already granted
     * group membership.
     */

    updatePaymentProcessingMessage(
      "Payment confirmed! You have successfully joined the group."
    );


    /*
     * Stop the spinner and show success.
     */

    const processingModal =
      document.getElementById(
        "connectaPaymentProcessingModal"
      );


    const spinner =
      processingModal?.querySelector(
        "div > div"
      );


    if (spinner) {

      spinner.style.animation =
        "none";

      spinner.style.border =
        "4px solid #22c55e";

      spinner.style.display =
        "flex";

      spinner.style.alignItems =
        "center";

      spinner.style.justifyContent =
        "center";


      spinner.innerHTML =
        "✓";

      spinner.style.color =
        "#22c55e";

      spinner.style.fontWeight =
        "900";

      spinner.style.fontSize =
        "22px";
    }


    /*
     * Give the success message a moment to be visible.
     */

    setTimeout(
      () => {

        closePaymentProcessingModal();


        location.href =
          `group-chat.html?groupId=${encodeURIComponent(
            group.groupId
          )}`;

      },
      1200
    );


  } catch (error) {

    console.error(
      "Private group payment error:",
      error
    );


    closePaymentProcessingModal();


    showToast(
      error.message ||
      "Could not start the group payment."
    );
  }
}


/* =========================================================
   POLL PRIVATE GROUP PAYMENT
   ---------------------------------------------------------
   Backend endpoint:

   POST
   /api/groups/:groupId/join-payment/status

   Body:

   {
     paymentId
   }

   The backend is responsible for:
   - Checking OptimaPay
   - Confirming payment
   - Adding the user to the group
   - Updating memberCount
   - Marking groupPayments completed
========================================================= */

async function pollPaidGroupJoinPayment(
  group,
  paymentId,
  token
) {

  const maxAttempts =
    30;


  /*
   * 2 seconds × 30 attempts
   * = approximately 60 seconds.
   */

  const delay =
    2000;


  for (
    let attempt = 0;
    attempt < maxAttempts;
    attempt++
  ) {

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          delay
        )
    );


    try {

      const response =
        await fetch(
          `https://connecta-backend-com.onrender.com/api/groups/${encodeURIComponent(
            group.groupId
          )}/join-payment/status`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${token}`
            },

            body:
              JSON.stringify({
                paymentId
              })
          }
        );


      const data =
        await response
          .json()
          .catch(
            () => ({})
          );


      /*
       * Backend errors.
       */

      if (!response.ok) {

        throw new Error(
          data.message ||
          data.error ||
          "Could not check group payment status."
        );
      }


      const status =
        String(
          data.status ||
          data.payment_status ||
          ""
        )
          .trim()
          .toLowerCase();


      /*
       * SUCCESS
       *
       * The backend should only return completed
       * after membership has been granted.
       */

      if (
        [
          "completed",
          "success",
          "successful",
          "paid"
        ].includes(
          status
        )
      ) {

        return true;
      }


      /*
       * Some backends return a direct success
       * flag as well.
       */

      if (
        data.success === true &&
        (
          data.joined === true ||
          data.membershipAdded === true ||
          data.completed === true
        )
      ) {

        return true;
      }


      /*
       * PAYMENT FAILED / CANCELLED
       */

      if (
        [
          "failed",
          "cancelled",
          "canceled",
          "rejected",
          "expired",
          "timeout"
        ].includes(
          status
        )
      ) {

        updatePaymentProcessingMessage(
  "The M-PESA payment was not completed."
);

setTimeout(
  () => {
    closePaymentProcessingModal();
  },
  1600
);

 return false;
}


      /*
       * Still pending.
       */

      if (
        attempt === 4
       ) {

  updatePaymentProcessingMessage(
    "Waiting for M-PESA payment confirmation..."
  );
}


if (
  attempt === 14
) {

  updatePaymentProcessingMessage(
    "M-PESA is taking a little longer. Please wait..."
  );
}


      /*
       * Last attempt.
       */

      if (
        attempt ===
        maxAttempts - 1
      ) {

        updatePaymentProcessingMessage(
  "Payment confirmation is taking longer than expected. Please try again shortly."
);

setTimeout(
  () => {
    closePaymentProcessingModal();
  },
  2200
);

return false;
      }

    } catch (error) {

      console.error(
        "Group payment status error:",
        error
      );


      /*
       * Do not immediately fail because of one
       * temporary network request error.
       */

      if (
  attempt ===
  maxAttempts - 1
) {

  updatePaymentProcessingMessage(
    "We could not confirm the payment right now. Please check your M-PESA transaction before trying again."
  );

  setTimeout(
    () => {
      closePaymentProcessingModal();
    },
    2500
  );

  return false;
      }
    }
  }


  return false;
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
   NO orderBy() HERE.

   Firestore only filters by status.
   JavaScript sorts by createdAt.

   This avoids composite-index errors.
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


        /*
         * Sort newest first on the client.
         */

        allGroups =
          sortGroupsByDate(
            allGroups,
            "createdAt"
          );


        renderPublicGroups(
          $("groupSearch")?.value ||
          ""
        );


        /*
         * Badge shows number of
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
   ---------------------------------------------------------
   NO orderBy() HERE EITHER.

   Firestore filters membership.
   JavaScript sorts by updatedAt.

   This avoids another composite-index requirement.
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


        /*
         * Sort newest activity first.
         */

        myGroups =
          sortGroupsByDate(
            myGroups,
            "updatedAt"
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
                rules or connection.
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

      chatLocked:
        false,

      announcementOnly:
        false,

      messagingLocked:
        false,

      deleted:
        false,

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


    renderHeaderProfile(
      currentProfile
    );


    applyGroupAccountControl();


    listenToOwnProfile(
      currentUser.uid
    );


    /*
     * Approved public + private groups.
     * No composite index required.
     */

    listenToApprovedGroups();


    /*
     * Groups where the current user
     * is a member.
     * No composite index required.
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
