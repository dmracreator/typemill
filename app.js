// ---------------------------------------------------------------------------
// Firebase: authentication (email/password + Google) and Cloud Firestore
// ---------------------------------------------------------------------------
// Accounts are managed by Firebase Auth (passwords hashed & stored server-side).
// Each user's workspace lives in Firestore at users/{uid}, guarded by security
// rules so people can only ever read/write their own data.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
  updatePassword,
  updateEmail,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// Firestore with offline persistence so reloads are instant and edits survive
// brief network drops.
let db;
try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
  });
} catch (error) {
  console.warn("Falling back to default Firestore cache", error);
  db = getFirestore(firebaseApp);
}

let currentUser = null;
let pendingSignupName = "";

function userDocRef(uid) {
  return doc(db, "users", uid);
}

// Map common Firebase auth error codes to friendly, human messages.
function authErrorMessage(error) {
  const code = (error && error.code) || "";
  const messages = {
    "auth/invalid-email": "That email address looks invalid.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account with that email already exists.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/cancelled-popup-request": "Google sign-in was cancelled.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in popup. Allow popups and try again.",
    "auth/requires-recent-login": "For security, please sign out and sign in again before making this change.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
    "auth/operation-not-allowed": "This sign-in method isn't enabled for the project yet.",
    "auth/configuration-not-found": "Authentication isn't switched on yet. In the Firebase console, open Authentication → Sign-in method and enable Email/Password and Google.",
    "auth/admin-restricted-operation": "Sign-ups are restricted. Enable Email/Password in the Firebase console."
  };
  return messages[code] || (error && error.message) || "Something went wrong.";
}

const presetStoryTags = [
  "fantasy",
  "romance",
  "mystery",
  "slow burn",
  "family",
  "grief",
  "magic",
  "coastal",
  "historical",
  "worldbuilding"
];

const defaultStories = [
  {
    id: "story-glass-orchard",
    title: "The Glass Orchard",
    genre: "Literary Fantasy",
    description:
      "A daughter returns to the family orchard where memory grows in glass fruit and every harvest asks for something in return.",
    tags: "memory, orchard, inheritance, lyrical fantasy",
    characters:
      "Iris Vale: a botanist who distrusts myth.\nElian Hart: childhood friend who stayed.\nMara Quill: aunt, keeper of the orchard ledgers.",
    coverClass: "cover-rose",
    coverImage: "",
    createdAt: "2026-02-14T08:30:00",
    updatedAt: "2026-06-06T09:18:00",
    archived: false,
    chapters: [
      {
        id: "chapter-1",
        title: "Wintergreen House",
        tags: "arrival, family home",
        text:
          "The house on the hill had always smelled of cedar drawers and old rain. Iris arrived before dawn, carrying a suitcase full of clothes and a silence that had taken years to grow.\n\nNo one opened the door when she knocked. The orchard below the ridge, however, answered at once, a pale clatter of glass fruit shifting in the wind."
      },
      {
        id: "chapter-2",
        title: "A Garden of Glass",
        tags: "orchard, wonder",
        text:
          "By full morning the trees had turned bright as lanterns. Each branch held fruit blown thin and luminous, their skins veined with trapped weather.\n\nShe touched one pear and felt a memory move inside it, not hers, but old enough to know her name."
      },
      {
        id: "chapter-3",
        title: "The Orchard Keeps Names",
        tags: "mother, whisper, inheritance",
        text:
          "Iris did not believe in haunted places until the orchard whispered her name back with her mother's voice.\n\nMorning light spilled across the glass fruit like poured milk, soft and pale and impossible. Each branch carried memory differently. Some trembled with old apologies. Others bowed under the weight of unsent letters.\n\nShe stepped between the rows with the careful silence of someone entering a chapel after years away. Somewhere beyond the hedgerow, Elian was calling for her, but his voice arrived blunted, as if the trees had decided it could wait."
      }
    ]
  },
  {
    id: "story-silent-sea",
    title: "Letters to the Silent Sea",
    genre: "Contemporary Fiction",
    description:
      "A woman sorting through her late grandmother's apartment discovers a set of unsent letters that redraw her understanding of love.",
    tags: "letters, grief, coast, mother-daughter",
    characters:
      "Nina Sol: archivist, practical, grieving.\nHelena Sol: grandmother and secret letter writer.\nMateo Valez: neighbor with a radio voice.",
    coverClass: "cover-blue",
    coverImage: "",
    createdAt: "2026-03-08T10:00:00",
    updatedAt: "2026-06-05T14:10:00",
    archived: false,
    chapters: [
      {
        id: "chapter-1",
        title: "Apartment 5B",
        tags: "inheritance, city",
        text:
          "The apartment felt smaller without Helena inside it. Nina catalogued the rooms the way she catalogued museum boxes: spine cracked, dust settled, contents fragile.\n\nInside the wardrobe she found a ribboned stack of letters, each addressed but never mailed."
      },
      {
        id: "chapter-2",
        title: "Low Tide Frequency",
        tags: "radio, seaside, confession",
        text:
          "Mateo's late-night radio program wandered through the kitchen while she read. By the third letter he had become the only voice in the room brave enough to interrupt the past."
      }
    ]
  },
  {
    id: "story-velvet-pine",
    title: "Velvet & Pine",
    genre: "Historical Romance",
    description:
      "A winter estate romance set between mountain pines, inherited debts, and a governess who refuses to disappear into the wallpaper.",
    tags: "winter, governess, estate, romance",
    characters:
      "Clara Whitlow: governess with sharp instincts.\nJonah Ashcombe: widowed estate heir.\nMae: stable girl and excellent spy.",
    coverClass: "cover-sage",
    coverImage: "",
    createdAt: "2026-04-01T12:00:00",
    updatedAt: "2026-06-03T16:40:00",
    archived: false,
    chapters: [
      {
        id: "chapter-1",
        title: "First Snow at Briar Hall",
        tags: "arrival, estate, snow",
        text:
          "By the time Clara reached Briar Hall, the snow had already hidden the road behind her.\n\nThe house rose from the mountain like something half remembered from a dream: stern windows, green-black pines, a door that opened only after she had nearly turned away."
      }
    ]
  },
  {
    id: "story-paper-moons",
    title: "Paper Moons",
    genre: "Essay Collection",
    description:
      "A quiet sequence of essays about place, solitude, and the rituals that make work possible.",
    tags: "essays, craft, solitude, notebooks",
    characters: "No character database required for this collection.",
    coverClass: "cover-cream",
    coverImage: "",
    createdAt: "2025-11-26T11:20:00",
    updatedAt: "2026-05-29T09:20:00",
    archived: true,
    chapters: [
      {
        id: "chapter-1",
        title: "Desk Light",
        tags: "essay, ritual",
        text:
          "The desk lamp comes on before the sentence does. Sometimes that is the entire practice: preparing a small field of light and trusting language to meet you there."
      }
    ]
  }
];

const DEFAULT_PROFILE = {
  name: "Emilia Rose",
  role: "Lyrical fantasy and literary fiction novelist",
  location: "Amsterdam, NL • Writing at first light",
  signature: "Softly mythic, emotionally precise",
  bio:
    "Novelist drawn to lyrical fantasy, intimate family histories, and stories where landscape behaves like memory.",
  genres: "Fantasy, Literary Fiction, Romance, Slow burn",
  website: "emiliarosewrites.com",
  instagram: "@emiliarosewrites",
  newsletter: "Letters from the Orchard",
  tiktok: "@emiliaroseauthor",
  followers: 18200,
  completedStories: 7,
  completedGoals: 132
};

const DEFAULT_SETTINGS = {
  account: {
    email: "emilia@typemill.app",
    displayName: "Emilia Rose",
    passwordHint: "Last updated this month"
  },
  writing: {
    sprintMinutes: 25,
    milestoneReminder: 1000
  },
  theme: {
    palette: "pastel",
    reducedMotion: false,
    compactSidebar: false
  },
  notifications: {
    streaks: true,
    exports: true,
    comments: true,
    backups: false
  },
  backup: {
    frequency: "weekly"
  },
  editor: {
    font: "sans",
    align: "left",
    indent: false
  }
};

const DEFAULT_GOALS = { today: 1000, week: 5000, month: 20000, year: 240000 };
// All analytics begin at zero — they accrue only as the writer actually writes.
function freshProgress() {
  return {
    today: 0,
    week: 0,
    month: 0,
    year: 0,
    streak: 0,
    bestStreak: 0,
    weekly: [0, 0, 0, 0, 0, 0, 0],
    daily: {}, // { "YYYY-MM-DD": wordsWritten } — powers the heat-map
    lastCount: null, // baseline word count; null until first measured
    lastWriteDay: null,
    day: null,
    weekKey: null,
    monthKey: null,
    yearKey: null,
    celebratedDay: null
  };
}
const DEFAULT_PROGRESS = freshProgress();

function buildDefaultState() {
  return {
    stories: JSON.parse(JSON.stringify(defaultStories)).map(normalizeStory),
    activePage: "dashboard",
    currentStoryId: defaultStories[0].id,
    currentChapterId: defaultStories[0].chapters[0].id,
    selectedStoryId: defaultStories[0].id,
    activeView: "grid",
    profileImage: "",
    profile: JSON.parse(JSON.stringify(DEFAULT_PROFILE)),
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    goals: { ...DEFAULT_GOALS },
    progress: freshProgress(),
    activity: [],
    journal: []
  };
}

// A single onboarding "concept story" that teaches how TYPEMILL works. It's
// seeded into every brand-new account and can be freely edited or deleted.
function buildWelcomeStory(name) {
  const greeting = name ? `Welcome, ${name}.` : "Welcome.";
  const now = new Date().toISOString();
  return {
    id: "story-welcome",
    title: "How Stories Work — Start Here",
    genre: "Guide",
    description:
      "A short, friendly walkthrough of TYPEMILL. Read it, edit it, or delete it once you've got the hang of things — your real writing starts whenever you do.",
    tags: "welcome, guide, getting started",
    goal: 1000,
    characters:
      "The Writer: that's you — every story here belongs only to your account.\nThe Muse: the spark you're chasing. Characters like these live in the Characters panel.",
    coverClass: "cover-rose",
    coverImage: "",
    createdAt: now,
    updatedAt: now,
    archived: false,
    notes:
      "This is your Story Notes space — jot scene intentions, revision reminders, or a quick chapter summary here. Replace this text anytime.",
    chapters: [
      {
        id: "chapter-welcome-1",
        title: "Start here",
        tags: "welcome",
        text: `${greeting}\n\nThis is a sample story — a living guide to how TYPEMILL works. Nothing here is precious: edit any chapter, rename it, or delete the whole story when you're ready to begin your own.\n\nEverything you write saves to your private account automatically. Sign in from any device and your stories, characters, and notes are waiting for you. No one else can see your work.\n\nWhen you're ready, read on — each chapter shows you one part of the studio.`
      },
      {
        id: "chapter-welcome-2",
        title: "Stories & chapters",
        tags: "stories, chapters, editor",
        text:
          "Your books live in My Stories. Each story opens into the Workspace — the split screen you're looking at now.\n\nOn the left is the Chapters panel. Press New to add a chapter, click any chapter to open it, and drag chapters to reorder them. Give each one a title and a few tags so you can find your way around later.\n\nThe big panel in the middle is the editor. Select any text to reveal formatting — Bold, Italic, Underline, and Quote — and just keep typing. Your word and page counts update as you go."
      },
      {
        id: "chapter-welcome-3",
        title: "Characters, tags & notes",
        tags: "characters, tags, notes",
        text:
          "Every story can hold a cast. Open the Characters panel and press Add to jot a name and a line about who they are — like The Writer and The Muse listed for this story.\n\nUse Story Tags and Chapter Tags to label themes, moods, or plot threads. Back in My Stories you can search and sort your whole library by these.\n\nThe Story Notes box (just below the editor) is your scratchpad for scene intentions, revision notes, or a quick summary — it stays with the story, separate from the prose."
      },
      {
        id: "chapter-welcome-4",
        title: "Focus, sprints & reader view",
        tags: "focus, sprint, reader",
        text:
          "Three tools help you actually write:\n\n• Focus mode hides everything but the page.\n• Sprint starts a countdown timer — set the length in Settings — for short bursts of writing.\n• Reader View shows your chapter as a clean page. Select text there to highlight it (pink, yellow, or blue) or leave yourself a comment; your annotations are saved in the Annotation History.\n\nAnd in the left sidebar, set Writing Goals for the day, week, month, and year — the meters fill as your word count grows."
      },
      {
        id: "chapter-welcome-5",
        title: "Publish & export",
        tags: "export, publish",
        text:
          "When a story is ready to share, upload a cover image, then use Export EPUB to download a real e-book file you can read or send anywhere. Publish marks a story as finished.\n\nThat's the whole studio. Delete this guide whenever you like (Settings has account tools too), press New Story, and begin.\n\nHappy writing."
      }
    ]
  };
}

function buildNewAccountState(name, email) {
  const finalName =
    name || (email ? email.split("@")[0] : "") || "New Author";
  const base = buildDefaultState();
  const story = normalizeStory(buildWelcomeStory(finalName));
  return {
    ...base,
    stories: [story],
    currentStoryId: story.id,
    currentChapterId: story.chapters[0].id,
    selectedStoryId: story.id,
    profile: { ...base.profile, name: finalName },
    settings: {
      ...base.settings,
      account: {
        ...base.settings.account,
        email: email || "",
        displayName: finalName
      }
    },
    // Fresh accounts start with a clean slate — all analytics begin at zero.
    // Baseline the word counter to the welcome story so the writer's very first
    // new words start counting immediately (the sample text itself doesn't).
    progress: { ...freshProgress(), lastCount: storyWordCount(story) },
    activity: []
  };
}

// Starts as defaults; replaced with the signed-in user's Firestore data on boot.
let state = buildDefaultState();

const navLinks = document.querySelectorAll("[data-page-target]");
const pages = document.querySelectorAll(".page");
const storyDisplay = document.getElementById("storiesDisplay");
const recentStoriesList = document.getElementById("recentStoriesList");
const lastEditedStoryMeta = document.getElementById("lastEditedStoryMeta");
const selectionBanner = document.getElementById("selectionBanner");
const selectionCover = document.getElementById("selectionCover");
const selectedStoryName = document.getElementById("selectedStoryName");
const openSelectedStoryButton = document.getElementById("openSelectedStoryButton");
const storySearch = document.getElementById("storySearch");
const sortStories = document.getElementById("sortStories");
const viewButtons = document.querySelectorAll(".toggle-button");
const storyTagList = document.getElementById("storyTagList");
const backToStoriesButton = document.getElementById("backToStoriesButton");
const exportTopbarButton = document.getElementById("exportTopbarButton");
const continueWritingButton = document.getElementById("continueWritingButton");
const dashboardWords = document.getElementById("dashboardWords");
const dashboardPages = document.getElementById("dashboardPages");
const dashboardDaily = document.getElementById("dashboardDaily");
const dashboardMonthly = document.getElementById("dashboardMonthly");
const dashboardMonthlyDetail = document.getElementById("dashboardMonthlyDetail");
const heroStreak = document.getElementById("heroStreak");
const heroActiveNovels = document.getElementById("heroActiveNovels");
const heroWeekWords = document.getElementById("heroWeekWords");
const chartBars = document.getElementById("chartBars");
const activityFeed = document.getElementById("activityFeed");
const heroGreeting = document.getElementById("heroGreeting");
const goalProgressGrid = document.getElementById("goalProgressGrid");
const goalCaption = document.getElementById("goalCaption");
const weeklyCaption = document.getElementById("weeklyCaption");
const momentumStats = document.getElementById("momentumStats");
const wordsByStory = document.getElementById("wordsByStory");
const libraryStats = document.getElementById("libraryStats");
const heatmap = document.getElementById("heatmap");
const heatmapCaption = document.getElementById("heatmapCaption");
const heatmapTitle = document.getElementById("heatmapTitle");
const topStories = document.getElementById("topStories");
const storyGoalInput = document.getElementById("storyGoalInput");
const storyGoalProgress = document.getElementById("storyGoalProgress");
const storyGoalLabel = document.getElementById("storyGoalLabel");
const storyGoalPercent = document.getElementById("storyGoalPercent");
const storyGoalBar = document.getElementById("storyGoalBar");
const sidebarAvatarButton = document.getElementById("sidebarAvatarButton");
const sidebarAvatarFallback = document.getElementById("sidebarAvatarFallback");
const sidebarAvatarImage = document.getElementById("sidebarAvatarImage");
const sidebarProfileName = document.getElementById("sidebarProfileName");
const sidebarProfileSubtitle = document.getElementById("sidebarProfileSubtitle");
const profileAvatarButton = document.getElementById("profileAvatarButton");
const profileAvatarFallback = document.getElementById("profileAvatarFallback");
const profileAvatarImage = document.getElementById("profileAvatarImage");
const authorPhotoInput = document.getElementById("authorPhotoInput");
const heroBookOne = document.getElementById("heroBookOne");
const heroBookTwo = document.getElementById("heroBookTwo");
const profileDisplayName = document.getElementById("profileDisplayName");
const profileDisplayRole = document.getElementById("profileDisplayRole");
const profileDisplayBio = document.getElementById("profileDisplayBio");
const profileDisplaySignature = document.getElementById("profileDisplaySignature");
const profileDisplayLocation = document.getElementById("profileDisplayLocation");
const profileTagPreview = document.getElementById("profileTagPreview");
const profileSocialPreview = document.getElementById("profileSocialPreview");
const profileShowcaseGrid = document.getElementById("profileShowcaseGrid");
const profileFollowersValue = document.getElementById("profileFollowersValue");
const profileCompletedStoriesValue = document.getElementById("profileCompletedStoriesValue");
const profileCompletedGoalsValue = document.getElementById("profileCompletedGoalsValue");
const profileTotalStoriesValue = document.getElementById("profileTotalStoriesValue");
const profileNameInput = document.getElementById("profileNameInput");
const profileRoleInput = document.getElementById("profileRoleInput");
const profileLocationInput = document.getElementById("profileLocationInput");
const profileSignatureInput = document.getElementById("profileSignatureInput");
const profileGenresInput = document.getElementById("profileGenresInput");
const profileBioInput = document.getElementById("profileBioInput");
const profileWebsiteInput = document.getElementById("profileWebsiteInput");
const profileInstagramInput = document.getElementById("profileInstagramInput");
const profileNewsletterInput = document.getElementById("profileNewsletterInput");
const profileTiktokInput = document.getElementById("profileTiktokInput");
const goalTodayInput = document.getElementById("goalTodayInput");
const goalWeekInput = document.getElementById("goalWeekInput");
const goalMonthInput = document.getElementById("goalMonthInput");
const goalYearInput = document.getElementById("goalYearInput");
const goalTodayMeta = document.getElementById("goalTodayMeta");
const goalWeekMeta = document.getElementById("goalWeekMeta");
const goalMonthMeta = document.getElementById("goalMonthMeta");
const goalYearMeta = document.getElementById("goalYearMeta");
const goalTodayBar = document.getElementById("goalTodayBar");
const goalWeekBar = document.getElementById("goalWeekBar");
const goalMonthBar = document.getElementById("goalMonthBar");
const goalYearBar = document.getElementById("goalYearBar");
const settingsEmailInput = document.getElementById("settingsEmailInput");
const settingsDisplayNameInput = document.getElementById("settingsDisplayNameInput");
const settingsSaveAccountButton = document.getElementById("settingsSaveAccountButton");
const settingsSignedInChip = document.getElementById("settingsSignedInChip");
const settingsAccountFeedback = document.getElementById("settingsAccountFeedback");
const settingsCurrentPasswordInput = document.getElementById("settingsCurrentPasswordInput");
const settingsNewPasswordInput = document.getElementById("settingsNewPasswordInput");
const settingsConfirmPasswordInput = document.getElementById("settingsConfirmPasswordInput");
const settingsChangePasswordButton = document.getElementById("settingsChangePasswordButton");
const settingsPasswordFeedback = document.getElementById("settingsPasswordFeedback");
const settingsSignOutButton = document.getElementById("settingsSignOutButton");
const settingsIdentityAvatar = document.getElementById("settingsIdentityAvatar");
const settingsIdentityName = document.getElementById("settingsIdentityName");
const settingsAccountMeta = document.getElementById("settingsAccountMeta");
const settingsAddAccountButton = document.getElementById("settingsAddAccountButton");
const settingsDeleteAccountButton = document.getElementById("settingsDeleteAccountButton");
const settingsDangerFeedback = document.getElementById("settingsDangerFeedback");
const settingsJumpButtons = document.querySelectorAll("[data-settings-jump]");
const settingsSprintLengthSelect = document.getElementById("settingsSprintLengthSelect");
const settingsMilestoneReminderSelect = document.getElementById("settingsMilestoneReminderSelect");
const settingsSyncGoalsButton = document.getElementById("settingsSyncGoalsButton");
const settingsPaletteSelect = document.getElementById("settingsPaletteSelect");
const settingsReducedMotionToggle = document.getElementById("settingsReducedMotionToggle");
const settingsCompactSidebarToggle = document.getElementById("settingsCompactSidebarToggle");
const settingsNotifyStreaksToggle = document.getElementById("settingsNotifyStreaksToggle");
const settingsNotifyExportsToggle = document.getElementById("settingsNotifyExportsToggle");
const settingsNotifyCommentsToggle = document.getElementById("settingsNotifyCommentsToggle");
const settingsNotifyBackupsToggle = document.getElementById("settingsNotifyBackupsToggle");
const settingsBackupFrequencySelect = document.getElementById("settingsBackupFrequencySelect");
const settingsDownloadBackupButton = document.getElementById("settingsDownloadBackupButton");
const settingsExportLibraryButton = document.getElementById("settingsExportLibraryButton");
const settingsRestoreButton = document.getElementById("settingsRestoreButton");
const settingsRestoreInput = document.getElementById("settingsRestoreInput");

const workspaceShell = document.getElementById("workspaceShell");
const workspaceCoverButton = document.getElementById("workspaceCoverButton");
const workspaceCover = document.getElementById("workspaceCover");
const workspaceStoryHeading = document.getElementById("workspaceStoryHeading");
const workspaceStoryMeta = document.getElementById("workspaceStoryMeta");
const chapterList = document.getElementById("chapterList");
const storyTitleInput = document.getElementById("storyTitleInput");
const storyGenreInput = document.getElementById("storyGenreInput");
const storyDescriptionInput = document.getElementById("storyDescriptionInput");
const storyNotesInput = document.getElementById("storyNotesInput");
const storyTagsInput = document.getElementById("storyTagsInput");
const characterList = document.getElementById("characterList");
const addCharacterButton = document.getElementById("addCharacterButton");
const chapterTitleInput = document.getElementById("chapterTitleInput");
const chapterMetaSecondaryLabel = document.getElementById("chapterMetaSecondaryLabel");
const chapterTagsInput = document.getElementById("chapterTagsInput");
const readerSelectionToolbar = document.getElementById("readerSelectionToolbar");
const readerHighlightPinkButton = document.getElementById("readerHighlightPinkButton");
const readerHighlightYellowButton = document.getElementById("readerHighlightYellowButton");
const readerHighlightBlueButton = document.getElementById("readerHighlightBlueButton");
const readerCommentButton = document.getElementById("readerCommentButton");
const storyEditor = document.getElementById("storyEditor");
const readerSurface = document.getElementById("readerSurface");
const chapterSummaryText = document.getElementById("chapterSummaryText");
const saveStatus = document.getElementById("saveStatus");
const focusModeToggle = document.getElementById("focusModeToggle");
const readerViewToggle = document.getElementById("readerViewToggle");
const sprintToggleButton = document.getElementById("sprintToggleButton");
const sprintPanel = document.getElementById("sprintPanel");
const addChapterButton = document.getElementById("addChapterButton");
const coverUploadInput = document.getElementById("coverUploadInput");
const archiveStoryButton = document.getElementById("archiveStoryButton");
const floatingFormatToolbar = document.getElementById("floatingFormatToolbar");
const readerCommentsCard = document.getElementById("readerCommentsCard");
const readerCommentList = document.getElementById("readerCommentList");
const editorBarWriting = document.getElementById("editorBarWriting");
const editorBarReader = document.getElementById("editorBarReader");
const editorFontSelect = document.getElementById("editorFontSelect");
const editorAlignGroup = document.getElementById("editorAlignGroup");
const editorIndentButton = document.getElementById("editorIndentButton");
const barCommentButton = document.getElementById("barCommentButton");
const commentBalloon = document.getElementById("commentBalloon");
const commentBalloonText = document.getElementById("commentBalloonText");
const commentBalloonSave = document.getElementById("commentBalloonSave");
const commentBalloonComplete = document.getElementById("commentBalloonComplete");
const commentBalloonDelete = document.getElementById("commentBalloonDelete");

const sprintClock = document.getElementById("sprintClock");
const startSprint = document.getElementById("startSprint");
const resetSprint = document.getElementById("resetSprint");
const journalEntryInput = document.getElementById("journalEntryInput");
const postJournalEntry = document.getElementById("postJournalEntry");
const journalTimeline = document.getElementById("journalTimeline");
const mentionDropdown = document.getElementById("mentionDropdown");
const journalEditingHint = document.getElementById("journalEditingHint");
const cancelJournalEdit = document.getElementById("cancelJournalEdit");

let saveTimeout;
let sprintInterval;
let sprintSeconds = 25 * 60;
let isReaderView = false;
let currentReaderSelection = null;

// Normalize a stored state blob (from Firestore or the local cache) into a
// complete state object, filling any missing fields with defaults.
function hydrateState(parsed) {
  try {
    if (parsed && Array.isArray(parsed.stories) && parsed.stories.length > 0) {
      const normalizedStories = parsed.stories.map(normalizeStory);
      return {
        stories: normalizedStories,
        activePage: parsed.activePage || "dashboard",
        currentStoryId: parsed.currentStoryId || normalizedStories[0].id,
        currentChapterId:
          parsed.currentChapterId || normalizedStories[0].chapters[0]?.id || null,
        selectedStoryId: parsed.selectedStoryId || normalizedStories[0].id,
        activeView: parsed.activeView || "grid",
        profileImage: parsed.profileImage || "",
        profile: {
          ...DEFAULT_PROFILE,
          ...(parsed.profile || {})
        },
        settings: {
          account: {
            ...DEFAULT_SETTINGS.account,
            ...(parsed.settings?.account || {})
          },
          writing: {
            ...DEFAULT_SETTINGS.writing,
            ...(parsed.settings?.writing || {})
          },
          theme: {
            ...DEFAULT_SETTINGS.theme,
            ...(parsed.settings?.theme || {})
          },
          notifications: {
            ...DEFAULT_SETTINGS.notifications,
            ...(parsed.settings?.notifications || {})
          },
          backup: {
            ...DEFAULT_SETTINGS.backup,
            ...(parsed.settings?.backup || {})
          },
          editor: {
            ...DEFAULT_SETTINGS.editor,
            ...(parsed.settings?.editor || {})
          }
        },
        goals: parsed.goals || { ...DEFAULT_GOALS },
        progress: { ...freshProgress(), ...(parsed.progress || {}) },
        activity: Array.isArray(parsed.activity) ? parsed.activity : [],
        journal: Array.isArray(parsed.journal) ? parsed.journal : []
      };
    }
  } catch (error) {
    console.error("Unable to hydrate TYPEMILL state", error);
  }

  return buildDefaultState();
}

function normalizeStory(story) {
  return {
    ...story,
    goal: Number(story.goal) || 0,
    characters: normalizeCharacters(story.characters),
    chapters: (story.chapters || []).map((chapter) => ({
      ...chapter,
      comments: Array.isArray(chapter.comments) ? chapter.comments : [],
      highlights: Array.isArray(chapter.highlights) ? chapter.highlights : []
    }))
  };
}

function normalizeCharacters(characters) {
  if (Array.isArray(characters)) {
    return characters.map((character) => ({
      id: character.id || createId("character"),
      name: character.name || "",
      description: character.description || ""
    }));
  }

  if (typeof characters === "string") {
    return characters
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, ...rest] = line.split(":");
        return {
          id: createId("character"),
          name: (name || "").trim(),
          description: rest.join(":").trim()
        };
      });
  }

  return [];
}

function serializeState() {
  return {
    stories: state.stories,
    activePage: state.activePage,
    currentStoryId: state.currentStoryId,
    currentChapterId: state.currentChapterId,
    selectedStoryId: state.selectedStoryId,
    activeView: state.activeView,
    profileImage: state.profileImage,
    profile: state.profile,
    settings: state.settings,
    goals: state.goals,
    progress: state.progress,
    activity: state.activity || [],
    journal: state.journal || []
  };
}

const FIRESTORE_DOC_LIMIT = 1024 * 1024; // Firestore hard limit: 1 MB per doc

function setSaveStatus(text, kind) {
  if (!saveStatus) return;
  saveStatus.textContent = text;
  saveStatus.dataset.saveKind = kind || "";
}

let saveDebounceTimer;
let sizeWarned = false;
// Persist to Firestore (debounced) and mirror to a local cache for instant
// reloads. The save indicator reflects the real write result. No-op signed out.
function persistState() {
  if (!currentUser) return;
  const snapshot = serializeState();
  const serialized = JSON.stringify(snapshot);
  try {
    localStorage.setItem(`typemill-cache::${currentUser.uid}`, serialized);
  } catch (error) {
    /* cache is best-effort */
  }

  setSaveStatus("Saving…", "saving");
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    if (!currentUser) return;

    // Guard against the 1 MB document limit (mostly driven by base64 images).
    if (serialized.length > FIRESTORE_DOC_LIMIT * 0.95) {
      setSaveStatus("Too large to sync", "error");
      if (!sizeWarned) {
        sizeWarned = true;
        showToast("⚠️ Your data is near the 1 MB limit — try smaller/fewer cover images.");
      }
      return;
    }
    sizeWarned = false;

    setDoc(
      userDocRef(currentUser.uid),
      { state: snapshot, updatedAt: serverTimestamp() },
      { merge: true }
    )
      .then(() => setSaveStatus("Saved to your account", "saved"))
      .catch((error) => {
        console.error("Unable to save to Firestore", error);
        setSaveStatus("Couldn't save — retrying…", "error");
        // Retry once shortly; if offline, Firestore's cache will sync later.
        setTimeout(() => persistState(), 5000);
      });
  }, 700);
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// Covers: when there's no uploaded photo, the cover is a generated visual that
// shows the book's title (like a minimalist book cover).
function coverTitleHtml(story) {
  return `<span class="cover-title">${escapeHtml(story.title || "Untitled")}</span>`;
}

function coverClassFor(story, baseClass) {
  return `${baseClass} ${story.coverClass}${story.coverImage ? " has-cover-image" : ""}`;
}

function coverStyleFor(story) {
  return story.coverImage ? `background-image:url('${story.coverImage}');` : "";
}

// Set up a cover <div> element directly (used for workspace/selection covers).
function applyCover(element, story, baseClass) {
  if (!element) return;
  element.className = coverClassFor(story, baseClass);
  element.style.backgroundImage = story.coverImage
    ? `url('${story.coverImage}')`
    : "";
  element.innerHTML = coverTitleHtml(story);
}

function relativeEditedLabel(dateString) {
  const now = new Date("2026-06-06T12:00:00");
  const diff = Math.max(0, now - new Date(dateString));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Edited today";
  if (days === 1) return "Edited yesterday";
  return `Edited ${days} days ago`;
}

function compactEditedTime(dateString) {
  const date = new Date(dateString);
  const now = new Date("2026-06-06T12:00:00");
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function countWords(text) {
  const cleaned = text.trim();
  return cleaned ? cleaned.split(/\s+/).length : 0;
}

function estimateA6Pages(words) {
  return Math.max(1, Math.ceil(words / 220));
}

function storyWordCount(story) {
  return story.chapters.reduce((sum, chapter) => sum + countWords(chapter.text), 0);
}

function storyPageCount(story) {
  return estimateA6Pages(storyWordCount(story));
}

function getStoryById(storyId = state.currentStoryId) {
  return state.stories.find((story) => story.id === storyId);
}

function getCurrentStory() {
  return getStoryById(state.currentStoryId) || state.stories[0];
}

function getCurrentChapter() {
  const story = getCurrentStory();
  if (!story) return null;
  return (
    story.chapters.find((chapter) => chapter.id === state.currentChapterId) ||
    story.chapters[0] ||
    null
  );
}

function touchStory(story) {
  story.updatedAt = new Date().toISOString();
  queueSaveMessage();
  persistState();
  renderDashboardMetrics();
}

function queueSaveMessage() {
  setSaveStatus("Saving…", "saving");
}

function openPage(targetId) {
  state.activePage = targetId;
  pages.forEach((page) => {
    page.classList.toggle("active", page.id === targetId);
  });

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.pageTarget === targetId);
  });

  if (targetId === "workspace") {
    renderWorkspace();
  }
  backToStoriesButton.hidden = targetId !== "workspace";
  exportTopbarButton.hidden = targetId !== "workspace";
  persistState();
}

function currentTotalWords() {
  return state.stories.reduce((sum, story) => sum + storyWordCount(story), 0);
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function mondayKey(date) {
  const d = new Date(date);
  const offset = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function weekdayIndex() {
  return (new Date().getDay() + 6) % 7; // Monday = 0
}

// Roll the period counters when the calendar day / week / month / year changes.
function syncAnalyticsPeriods() {
  const p = state.progress;
  if (!Array.isArray(p.weekly) || p.weekly.length !== 7) {
    p.weekly = [0, 0, 0, 0, 0, 0, 0];
  }
  const day = todayKey();
  const month = day.slice(0, 7);
  const year = day.slice(0, 4);
  const wk = mondayKey(new Date());

  if (p.day == null) {
    p.day = day;
    p.weekKey = wk;
    p.monthKey = month;
    p.yearKey = year;
  }
  if (p.day !== day) {
    p.today = 0;
    p.day = day;
  }
  if (p.weekKey !== wk) {
    p.week = 0;
    p.weekly = [0, 0, 0, 0, 0, 0, 0];
    p.weekKey = wk;
  }
  if (p.monthKey !== month) {
    p.month = 0;
    p.monthKey = month;
  }
  if (p.yearKey !== year) {
    p.year = 0;
    p.yearKey = year;
  }
  // Break the streak if more than a day has passed with no writing.
  if (p.lastWriteDay) {
    const gap = Math.round(
      (new Date(day + "T00:00:00") - new Date(p.lastWriteDay + "T00:00:00")) /
        86400000
    );
    if (gap > 1) p.streak = 0;
  }
}

// Reset the analytics baseline (e.g. after adding/removing a story) so structural
// word-count changes are never counted as "words written".
function resetWordBaseline() {
  state.progress.lastCount = currentTotalWords();
}

let trackTimer;
function trackWordProgress() {
  clearTimeout(trackTimer);
  trackTimer = setTimeout(() => {
    const p = state.progress;
    syncAnalyticsPeriods();
    const total = currentTotalWords();
    if (p.lastCount == null) {
      p.lastCount = total;
      persistState();
      return;
    }
    const delta = total - p.lastCount;
    p.lastCount = total;
    if (delta <= 0) {
      persistState();
      return;
    }
    const day = todayKey();
    p.today += delta;
    p.week += delta;
    p.month += delta;
    p.year += delta;
    p.weekly[weekdayIndex()] += delta;

    // Daily history for the heat-map (pruned to ~13 months).
    if (!p.daily || typeof p.daily !== "object") p.daily = {};
    p.daily[day] = (p.daily[day] || 0) + delta;
    const keys = Object.keys(p.daily);
    if (keys.length > 400) {
      keys
        .sort()
        .slice(0, keys.length - 400)
        .forEach((k) => delete p.daily[k]);
    }

    if (p.lastWriteDay !== day) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      p.streak = p.lastWriteDay === yesterday ? (p.streak || 0) + 1 : 1;
      p.lastWriteDay = day;
    }
    if ((p.streak || 0) > (p.bestStreak || 0)) p.bestStreak = p.streak;

    // Daily goal celebration — fire once per day when the target is reached.
    const dailyGoal = state.goals.today || 0;
    if (dailyGoal > 0 && p.today >= dailyGoal && p.celebratedDay !== day) {
      p.celebratedDay = day;
      showToast(`🎉 Daily goal reached — ${p.today.toLocaleString()} words today!`);
    }

    renderGoalCard();
    renderDashboardMetrics();
    persistState();
  }, 500);
}

let toastTimer;
function showToast(message) {
  let el = document.getElementById("typemillToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "typemillToast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  // Force reflow so re-triggering the animation works.
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
}

function recordActivity(title, detail) {
  if (!Array.isArray(state.activity)) state.activity = [];
  state.activity.unshift({ title, detail: detail || "", ts: Date.now() });
  state.activity = state.activity.slice(0, 12);
}

function relativeFromNow(ts) {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function renderWeeklyChart() {
  if (!chartBars) return;
  const weekly =
    Array.isArray(state.progress.weekly) && state.progress.weekly.length === 7
      ? state.progress.weekly
      : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...weekly, 1);
  const todayIdx = weekdayIndex();
  chartBars.innerHTML = WEEKDAY_LABELS.map((label, i) => {
    const value = weekly[i] || 0;
    const height = Math.round((value / max) * 100);
    const isToday = i === todayIdx;
    return `<div class="${isToday ? "is-today" : ""}">
      <span style="height:${height}%" title="${label}: ${value.toLocaleString()} words"><b class="bar-value">${value.toLocaleString()}</b></span>
      <small>${label}${isToday ? " •" : ""}</small>
    </div>`;
  }).join("");
}

function computeAnalytics() {
  const stories = state.stories || [];
  const published = stories.filter((s) => s.published).length;
  const totalWords = currentTotalWords();
  const totalChapters = stories.reduce((sum, s) => sum + s.chapters.length, 0);
  const totalCharacters = stories.reduce(
    (sum, s) => sum + (Array.isArray(s.characters) ? s.characters.length : 0),
    0
  );
  const avgWordsPerStory = stories.length
    ? Math.round(totalWords / stories.length)
    : 0;

  const weekly =
    Array.isArray(state.progress.weekly) && state.progress.weekly.length === 7
      ? state.progress.weekly
      : [0, 0, 0, 0, 0, 0, 0];
  const weekTotal = weekly.reduce((a, b) => a + b, 0);
  const daysWritten = weekly.filter((w) => w > 0).length;
  const avgPerDay = daysWritten ? Math.round(weekTotal / daysWritten) : 0;
  let bestDay = null;
  if (weekTotal > 0) {
    const idx = weekly.indexOf(Math.max(...weekly));
    bestDay = { label: WEEKDAY_LABELS[idx], words: weekly[idx] };
  }

  const byStory = stories
    .map((s) => ({ title: s.title, words: storyWordCount(s), goal: s.goal || 0 }))
    .sort((a, b) => b.words - a.words);

  return {
    storyCount: stories.length,
    publishedCount: published,
    draftCount: stories.length - published,
    totalChapters,
    totalCharacters,
    avgWordsPerStory,
    weekTotal,
    avgPerDay,
    bestDay,
    byStory
  };
}

function tilesHtml(tiles) {
  return tiles
    .map(
      (t) =>
        `<div class="metric-tile"><span>${escapeHtml(t.label)}</span><strong>${escapeHtml(
          String(t.value)
        )}</strong></div>`
    )
    .join("");
}

function renderAnalytics() {
  const a = computeAnalytics();
  const p = state.progress;

  // Goal progress bars (today / week / month / year)
  if (goalProgressGrid) {
    const periods = [
      { key: "today", label: "Today" },
      { key: "week", label: "This week" },
      { key: "month", label: "This month" },
      { key: "year", label: "This year" }
    ];
    goalProgressGrid.innerHTML = periods
      .map((pr) => {
        const val = p[pr.key] || 0;
        const goal = state.goals[pr.key] || 0;
        const pct = goal > 0 ? Math.min(100, Math.round((val / goal) * 100)) : 0;
        const reached = goal > 0 && val >= goal;
        return `<div class="goal-progress-item${reached ? " is-complete" : ""}">
          <div class="goal-progress-top"><span>${pr.label}</span><strong>${pct}%</strong></div>
          <div class="meter"><span style="width:${pct}%"></span></div>
          <small>${val.toLocaleString()} / ${goal.toLocaleString()} words${reached ? " ✓" : ""}</small>
        </div>`;
      })
      .join("");
  }
  if (goalCaption) {
    goalCaption.textContent = `${(p.year || 0).toLocaleString()} words written this year`;
  }

  if (weeklyCaption) {
    weeklyCaption.textContent =
      a.weekTotal > 0
        ? `${a.weekTotal.toLocaleString()} words · avg ${a.avgPerDay.toLocaleString()}/active day${
            a.bestDay ? ` · best ${a.bestDay.label}` : ""
          }`
        : "No words logged this week yet";
  }

  if (momentumStats) {
    momentumStats.innerHTML = tilesHtml([
      {
        label: "Current streak",
        value: `${p.streak || 0} ${(p.streak || 0) === 1 ? "day" : "days"}`
      },
      {
        label: "Best streak",
        value: `${p.bestStreak || 0} ${(p.bestStreak || 0) === 1 ? "day" : "days"}`
      },
      { label: "Avg / writing day", value: `${a.avgPerDay.toLocaleString()} w` },
      {
        label: "Best day (week)",
        value: a.bestDay ? `${a.bestDay.label} · ${a.bestDay.words.toLocaleString()}` : "—"
      }
    ]);
  }

  if (libraryStats) {
    libraryStats.innerHTML = tilesHtml([
      { label: "Stories", value: a.storyCount },
      { label: "Published", value: a.publishedCount },
      { label: "Drafts", value: a.draftCount },
      { label: "Chapters", value: a.totalChapters },
      { label: "Characters", value: a.totalCharacters },
      { label: "Avg / story", value: `${a.avgWordsPerStory.toLocaleString()} w` }
    ]);
  }

  if (wordsByStory) {
    if (!a.byStory.length) {
      wordsByStory.innerHTML = '<p class="muted">No stories yet — create one to see your word distribution.</p>';
    } else {
      const max = Math.max(...a.byStory.map((s) => s.words), 1);
      wordsByStory.innerHTML = a.byStory
        .slice(0, 6)
        .map((s) => {
          const pct = Math.max(2, Math.round((s.words / max) * 100));
          const goalNote =
            s.goal > 0
              ? `<small class="wbs-goal">${Math.min(
                  100,
                  Math.round((s.words / s.goal) * 100)
                )}% of ${s.goal.toLocaleString()} goal</small>`
              : "";
          return `<div class="wbs-row">
            <div class="wbs-label">${escapeHtml(s.title)}${goalNote}</div>
            <div class="wbs-bar"><span style="width:${pct}%"></span></div>
            <div class="wbs-value">${s.words.toLocaleString()}</div>
          </div>`;
        })
        .join("");
    }
  }

  renderHeatmap();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Monthly calendar heat-map of words written per day.
function renderHeatmap() {
  if (!heatmap) return;
  const daily = state.progress.daily || {};
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Mon = 0
  const todayStr = todayKey();

  // Determine intensity buckets from this month's values.
  const monthValues = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    monthValues.push(daily[key] || 0);
  }
  const max = Math.max(...monthValues, 1);
  const level = (v) => {
    if (v <= 0) return 0;
    const ratio = v / max;
    if (ratio > 0.75) return 4;
    if (ratio > 0.5) return 3;
    if (ratio > 0.25) return 2;
    return 1;
  };

  const headers = ["M", "T", "W", "T", "F", "S", "S"]
    .map((d) => `<i class="heat-head">${d}</i>`)
    .join("");
  const blanks = Array.from({ length: firstWeekday }, () => '<i class="heat-cell heat-blank"></i>').join("");
  const cells = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const words = daily[key] || 0;
    const isToday = key === todayStr;
    cells.push(
      `<i class="heat-cell level-${level(words)}${isToday ? " is-today" : ""}" title="${MONTH_NAMES[month]} ${d}: ${words.toLocaleString()} words">${d}</i>`
    );
  }
  heatmap.innerHTML = headers + blanks + cells.join("");

  if (heatmapTitle) heatmapTitle.textContent = `${MONTH_NAMES[month]} ${year}`;
  if (heatmapCaption) {
    const total = monthValues.reduce((a, b) => a + b, 0);
    const activeDays = monthValues.filter((v) => v > 0).length;
    heatmapCaption.textContent =
      total > 0
        ? `${total.toLocaleString()} words · ${activeDays} active ${activeDays === 1 ? "day" : "days"} this month`
        : "No words logged this month yet";
  }

  renderTopStories();
}

// Ranked list of the stories with the most words — shown beside the heat-map.
function renderTopStories() {
  if (!topStories) return;
  const ranked = state.stories
    .map((s) => ({
      title: s.title,
      words: storyWordCount(s),
      chapters: s.chapters.length,
      goal: s.goal || 0
    }))
    .sort((a, b) => b.words - a.words)
    .slice(0, 5);

  if (!ranked.length || ranked.every((s) => s.words === 0)) {
    topStories.innerHTML =
      '<li class="top-story-empty">Start writing and your most-developed stories will rank here.</li>';
    return;
  }

  topStories.innerHTML = ranked
    .map((s, i) => {
      const goalNote =
        s.goal > 0
          ? ` · ${Math.min(100, Math.round((s.words / s.goal) * 100))}% of goal`
          : "";
      return `<li class="top-story">
        <span class="rank">${i + 1}</span>
        <div class="top-story-copy">
          <strong>${escapeHtml(s.title)}</strong>
          <small>${s.words.toLocaleString()} words · ${s.chapters} ${
        s.chapters === 1 ? "chapter" : "chapters"
      }${goalNote}</small>
        </div>
      </li>`;
    })
    .join("");
}

function renderActivityFeed() {
  if (!activityFeed) return;
  const items = state.activity || [];
  if (!items.length) {
    activityFeed.innerHTML =
      '<article class="activity-empty"><strong>No activity yet</strong><p>Your writing milestones, new stories, and exports will show up here.</p></article>';
    return;
  }
  activityFeed.innerHTML = items
    .slice(0, 8)
    .map(
      (item) => `
        <article>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.detail || "")}</p>
          <span>${escapeHtml(relativeFromNow(item.ts))}</span>
        </article>`
    )
    .join("");
}

function renderDashboardMetrics() {
  syncAnalyticsPeriods();
  if (heroGreeting) {
    const firstName = (state.profile.name || "").trim().split(/\s+/)[0];
    heroGreeting.textContent = firstName ? `Welcome back, ${firstName}` : "Welcome back";
  }
  const totalWords = currentTotalWords();
  const totalPages = state.stories.reduce(
    (sum, story) => sum + storyPageCount(story),
    0
  );
  dashboardWords.textContent = totalWords.toLocaleString();
  dashboardPages.textContent = totalPages.toLocaleString();

  const p = state.progress;
  if (dashboardDaily) dashboardDaily.textContent = (p.today || 0).toLocaleString();

  const monthGoal = state.goals.month || 0;
  const pct =
    monthGoal > 0 ? Math.min(100, Math.round(((p.month || 0) / monthGoal) * 100)) : 0;
  if (dashboardMonthly) dashboardMonthly.textContent = `${pct}%`;
  if (dashboardMonthlyDetail) {
    dashboardMonthlyDetail.textContent = `${(p.month || 0).toLocaleString()} / ${monthGoal.toLocaleString()} words`;
  }

  const activeNovels = state.stories.filter((story) => !story.archived).length;
  if (heroStreak) heroStreak.textContent = `${p.streak || 0} day writing streak`;
  if (heroActiveNovels) {
    heroActiveNovels.textContent = `${activeNovels} active ${
      activeNovels === 1 ? "novel" : "novels"
    }`;
  }
  if (heroWeekWords) {
    heroWeekWords.textContent = `${(p.week || 0).toLocaleString()} words this week`;
  }

  renderWeeklyChart();
  renderActivityFeed();
  renderAnalytics();
}

function applyThemeSettings() {
  const { palette, reducedMotion, compactSidebar } = state.settings.theme;
  document.body.dataset.palette = palette;
  document.body.classList.toggle("reduced-motion", Boolean(reducedMotion));
  document.body.classList.toggle("compact-sidebar", Boolean(compactSidebar));
}

function initialsFromName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "TM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function accountProviderLabel() {
  if (!currentUser) return "";
  const providers = currentUser.providerData.map((p) => p.providerId);
  if (providers.includes("google.com")) return "Google account";
  if (providers.includes("password")) return "Email & password";
  return "Account";
}

function renderSettings() {
  const { account, writing, theme, notifications, backup } = state.settings;

  settingsEmailInput.value = account.email;
  settingsDisplayNameInput.value = account.displayName;

  if (settingsSignedInChip) {
    settingsSignedInChip.textContent = currentUser
      ? "Signed in"
      : "Not signed in";
  }
  if (settingsIdentityName) {
    settingsIdentityName.textContent = account.displayName || "Author";
  }
  if (settingsAccountMeta) {
    const created = currentUser?.metadata?.creationTime;
    const provider = accountProviderLabel();
    settingsAccountMeta.textContent = currentUser
      ? [currentUser.email, provider, created ? `Member since ${formatDate(created)}` : ""]
          .filter(Boolean)
          .join(" • ")
      : "Sign in to manage your account.";
  }
  if (settingsIdentityAvatar) {
    const span = settingsIdentityAvatar.querySelector("span");
    if (state.profileImage) {
      settingsIdentityAvatar.style.backgroundImage = `url(${state.profileImage})`;
      settingsIdentityAvatar.classList.add("has-image");
    } else {
      settingsIdentityAvatar.style.backgroundImage = "";
      settingsIdentityAvatar.classList.remove("has-image");
      if (span) span.textContent = initialsFromName(account.displayName);
    }
  }

  settingsSprintLengthSelect.value = String(writing.sprintMinutes);
  settingsMilestoneReminderSelect.value = String(writing.milestoneReminder);
  settingsPaletteSelect.value = theme.palette;
  settingsReducedMotionToggle.checked = Boolean(theme.reducedMotion);
  settingsCompactSidebarToggle.checked = Boolean(theme.compactSidebar);
  settingsNotifyStreaksToggle.checked = Boolean(notifications.streaks);
  settingsNotifyExportsToggle.checked = Boolean(notifications.exports);
  settingsNotifyCommentsToggle.checked = Boolean(notifications.comments);
  settingsNotifyBackupsToggle.checked = Boolean(notifications.backups);
  settingsBackupFrequencySelect.value = backup.frequency;
  applyThemeSettings();
}

function updateSettings(section, key, value) {
  state.settings[section][key] = value;
  persistState();
  renderSettings();
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderAuthorPhoto() {
  const hasPhoto = Boolean(state.profileImage);
  [sidebarAvatarImage, profileAvatarImage].forEach((image) => {
    image.hidden = !hasPhoto;
    image.src = hasPhoto ? state.profileImage : "";
  });
  [sidebarAvatarFallback, profileAvatarFallback].forEach((fallback) => {
    fallback.hidden = hasPhoto;
  });
}

function renderHeroBooks() {
  const heroStories = [...state.stories]
    .filter((story) => !story.archived)
    .sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt))
    .slice(0, 2);

  [heroBookOne, heroBookTwo].forEach((book, index) => {
    const story = heroStories[index];
    if (!story) return;
    book.className = `floating-book ${index === 0 ? "floating-book-main" : "floating-book-accent"} ${story.coverClass}`;
    book.style.backgroundImage = story.coverImage ? `url('${story.coverImage}')` : "";
  });
}

function formatFollowerCount(value) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }

  return String(value);
}

function getProfileLinks() {
  return [
    { label: "Website", value: state.profile.website },
    { label: "Instagram", value: state.profile.instagram },
    { label: "Newsletter", value: state.profile.newsletter },
    { label: "TikTok", value: state.profile.tiktok }
  ].filter((item) => item.value && item.value.trim());
}

function renderProfile() {
  const profile = state.profile;
  const genreTags = profile.genres
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
  const publishedStories = [...state.stories]
    .filter((story) => !story.archived)
    .sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt))
    .slice(0, 3);

  sidebarProfileName.textContent = profile.name;
  sidebarProfileSubtitle.textContent = genreTags.slice(0, 3).join(", ") || "Writer";
  profileDisplayName.textContent = profile.name;
  profileDisplayRole.textContent = profile.role;
  profileDisplayBio.textContent = profile.bio;
  profileDisplaySignature.textContent = profile.signature;
  profileDisplayLocation.textContent = profile.location;

  profileNameInput.value = profile.name;
  profileRoleInput.value = profile.role;
  profileLocationInput.value = profile.location;
  profileSignatureInput.value = profile.signature;
  profileGenresInput.value = profile.genres;
  profileBioInput.value = profile.bio;
  profileWebsiteInput.value = profile.website;
  profileInstagramInput.value = profile.instagram;
  profileNewsletterInput.value = profile.newsletter;
  profileTiktokInput.value = profile.tiktok;

  profileTagPreview.innerHTML = genreTags
    .map((genre) => `<span>${escapeHtml(genre)}</span>`)
    .join("");

  profileSocialPreview.innerHTML = getProfileLinks()
    .map(
      (link) =>
        `<a href="#" data-profile-link="${escapeHtml(link.label.toLowerCase())}">${escapeHtml(
          link.value
        )}</a>`
    )
    .join("");

  profileShowcaseGrid.innerHTML = publishedStories
    .map(
      (story) => `
        <article class="showcase-card" data-story-open="${story.id}">
          <div class="${coverClassFor(story, "library-cover")}" style="${coverStyleFor(story)}">${coverTitleHtml(story)}</div>
          <div class="showcase-copy">
            <h4>${escapeHtml(story.title)}</h4>
            <p>${escapeHtml(story.description)}</p>
          </div>
        </article>
      `
    )
    .join("");

  profileFollowersValue.textContent = formatFollowerCount(Number(profile.followers) || 0);
  profileCompletedStoriesValue.textContent = String(
    Math.max(Number(profile.completedStories) || 0, 0)
  );
  profileCompletedGoalsValue.textContent = String(
    Math.max(Number(profile.completedGoals) || 0, 0)
  );
  profileTotalStoriesValue.textContent = String(state.stories.length);
}

function updateProfileField(key, value) {
  state.profile[key] = value;
  persistState();
  renderProfile();
}

async function shareProfile() {
  const slug = state.profile.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const shareUrl = `https://typemill.app/authors/${slug || "author"}`;

  try {
    await navigator.clipboard.writeText(shareUrl);
  } catch (error) {
    console.error("Unable to copy profile link", error);
  }
}

function updateSelectionToolbar() {
  // The floating toolbar is replaced by the full-width editor bar.
  if (floatingFormatToolbar) floatingFormatToolbar.hidden = true;
}

function storyToReaderHtml(text, highlights = []) {
  const safeHighlights = [...highlights]
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((first, second) => first.start - second.start);

  let cursor = 0;
  let html = "";

  safeHighlights.forEach((highlight, index) => {
    const start = Math.max(cursor, highlight.start);
    const end = Math.min(text.length, highlight.end);
    if (end <= start) return;

    html += escapeHtml(text.slice(cursor, start));
    const piece = escapeHtml(text.slice(start, end));
    if (highlight.comment !== undefined && highlight.comment !== null && highlight.kind === "comment") {
      // Comments are shown as an underline; hovering opens an editable balloon.
      html += `<span class="reader-comment-mark ${highlight.completed ? "is-complete" : ""}" data-highlight-id="${
        highlight.id
      }" data-comment="${escapeHtml(highlight.comment || "")}">${piece}</span>`;
    } else {
      html += `<mark class="reader-highlight reader-highlight-${escapeHtml(
        highlight.color || ["pink", "yellow", "blue"][index % 3]
      )} ${highlight.completed ? "is-complete" : ""}" data-highlight-id="${highlight.id}">${piece}</mark>`;
    }
    cursor = end;
  });

  html += escapeHtml(text.slice(cursor));
  return html;
}

function renderReaderSurface() {
  const chapter = getCurrentChapter();
  if (!chapter) return;
  readerSurface.innerHTML = storyToReaderHtml(chapter.text || "", chapter.highlights || []);
}

function renderReaderComments() {
  const chapter = getCurrentChapter();
  if (!chapter) return;
  const highlights = Array.isArray(chapter.highlights) ? chapter.highlights : [];
  const annotations = [...highlights].sort((first, second) => first.start - second.start);
  const openComments = annotations.filter((item) => item.comment && !item.completed).length;

  chapterMetaSecondaryLabel.textContent = isReaderView ? "Open Comments" : "Chapter Tags";
  chapterTagsInput.value = isReaderView
    ? `${openComments} comment${openComments === 1 ? "" : "s"} to review`
    : chapter.tags;
  chapterTagsInput.readOnly = isReaderView;

  readerCommentList.innerHTML = annotations.length
    ? annotations
        .map((item) => {
          const isComment = item.kind === "comment";
          const swatch = isComment ? "comment" : item.color || "pink";
          const body = isComment
            ? `<p>${escapeHtml(item.comment || "(empty comment)")}</p>`
            : `<p class="muted">${escapeHtml((item.color || "pink").replace(/^\w/, (c) => c.toUpperCase()))} highlight.</p>`;
          return `
            <article class="reader-comment-item ${item.completed ? "is-complete" : ""}" data-highlight-id="${
            item.id
          }">
              <div class="reader-comment-head">
                <span class="reader-history-swatch reader-history-${escapeHtml(swatch)}"></span>
                <strong>${isComment ? "Comment" : "Highlight"}</strong>
                <small>${item.completed ? "Done" : "Active"}</small>
              </div>
              <p class="reader-history-excerpt">${escapeHtml(item.text || "")}</p>
              ${body}
            </article>
          `;
        })
        .join("")
    : `<p class="muted">No highlights or comments yet for this chapter.</p>`;
}

const EDITOR_FONT_MAP = {
  sans: '"Instrument Sans", "Avenir Next", "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SF Mono", "JetBrains Mono", Menlo, monospace'
};

// Apply the writing-display preferences to both the editor and reader surface.
function applyEditorSettings() {
  const editor = state.settings.editor || DEFAULT_SETTINGS.editor;
  const fontFamily = EDITOR_FONT_MAP[editor.font] || EDITOR_FONT_MAP.sans;
  const align = ["left", "center", "right"].includes(editor.align) ? editor.align : "left";
  [storyEditor, readerSurface].forEach((el) => {
    if (!el) return;
    el.style.fontFamily = fontFamily;
    el.style.textAlign = align;
    el.classList.toggle("paragraph-indent", Boolean(editor.indent));
  });
}

function renderEditorBar() {
  const editor = state.settings.editor || DEFAULT_SETTINGS.editor;
  if (editorFontSelect) editorFontSelect.value = editor.font;
  if (editorAlignGroup) {
    editorAlignGroup.querySelectorAll("[data-align]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.align === editor.align);
    });
  }
  if (editorIndentButton) {
    editorIndentButton.classList.toggle("is-active", Boolean(editor.indent));
  }
  applyEditorSettings();
}

function updateReaderMode() {
  storyEditor.hidden = isReaderView;
  readerSurface.hidden = !isReaderView;
  // The highlights & comments log stays visible in both modes.
  readerCommentsCard.hidden = false;
  if (editorBarWriting) editorBarWriting.hidden = isReaderView;
  if (editorBarReader) editorBarReader.hidden = !isReaderView;
  readerViewToggle.textContent = isReaderView ? "Writing View" : "Reader View";
  readerViewToggle.classList.toggle("is-open", isReaderView);
  currentReaderSelection = null;
  setReaderBarActive(false);
  hideCommentBalloon();
  if (readerSelectionToolbar) readerSelectionToolbar.hidden = true;
  renderReaderSurface();
  renderReaderComments();
  updateSelectionToolbar();
}

function updateFocusButtonLabel() {
  focusModeToggle.textContent = workspaceShell.classList.contains("focus-mode")
    ? "Detail Mode"
    : "Focus mode";
}

// Read the rich editor into the chapter (HTML for display, plain text for
// word-count / reader / export).
function commitEditorContent() {
  const story = getCurrentStory();
  const chapter = getCurrentChapter();
  if (!story || !chapter) return;
  chapter.richText = storyEditor.innerHTML;
  chapter.text = storyEditor.innerText;
  touchStory(story);
  refreshWorkspaceHeader();
  renderStoryLibrary();
  renderRecentStories();
}

// Apply live (WYSIWYG) formatting to the current selection in the editor.
function applyFormat(format) {
  if (isReaderView) return;
  storyEditor.focus();
  if (format === "bold") {
    document.execCommand("bold");
  } else if (format === "italic") {
    document.execCommand("italic");
  } else if (format === "underline") {
    document.execCommand("underline");
  } else if (format === "quote") {
    // Toggle a blockquote on the current line/selection.
    const inQuote = !!getSelectionBlock("BLOCKQUOTE");
    document.execCommand("formatBlock", false, inQuote ? "P" : "BLOCKQUOTE");
  }
  commitEditorContent();
}

function getSelectionBlock(tagName) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  while (node && node !== storyEditor) {
    if (node.nodeType === 1 && node.tagName === tagName) return node;
    node = node.parentNode;
  }
  return null;
}

function updateLastEditedMeta() {
  const latest = [...state.stories].sort(
    (first, second) => new Date(second.updatedAt) - new Date(first.updatedAt)
  )[0];
  lastEditedStoryMeta.textContent = latest
    ? compactEditedTime(latest.updatedAt)
    : "";
}

function renderGoalCard() {
  const goalMap = [
    ["today", goalTodayInput, goalTodayMeta, goalTodayBar],
    ["week", goalWeekInput, goalWeekMeta, goalWeekBar],
    ["month", goalMonthInput, goalMonthMeta, goalMonthBar],
    ["year", goalYearInput, goalYearMeta, goalYearBar]
  ];

  goalMap.forEach(([key, input, meta, bar]) => {
    const goal = Number(state.goals[key]) || 0;
    const progress = Number(state.progress[key]) || 0;
    input.value = goal;
    meta.textContent = `${progress.toLocaleString()} written`;
    bar.style.width = `${goal > 0 ? Math.min(100, (progress / goal) * 100) : 0}%`;
  });
}

function getStoryTags(story) {
  return story.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function renderStoryTagChips() {
  const story = getStoryById(state.selectedStoryId) || getCurrentStory();
  if (!story) return;
  const currentTags = getStoryTags(story);

  storyTagList.innerHTML = currentTags
    .map((tag) => {
      return `<span class="tag-chip is-applied">${escapeHtml(tag)}</span>`;
    })
    .join("");

  if (!currentTags.length) {
    storyTagList.innerHTML = `<span class="tag-chip">No tags yet</span>`;
  }
}

function renderRecentStories() {
  const recent = [...state.stories]
    .sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt))
    .slice(0, 3);

  recentStoriesList.innerHTML = recent
    .map((story) => {
      const progress = Math.min(100, Math.max(16, story.chapters.length * 18));
      return `
        <article class="story-row">
          <div class="${coverClassFor(story, "story-cover")}" style="${coverStyleFor(story)}">${coverTitleHtml(story)}</div>
          <div>
            <h4>${escapeHtml(story.title)}</h4>
            <p>${escapeHtml(story.genre)} • ${storyWordCount(story).toLocaleString()} words</p>
          </div>
          <div class="story-progress">
            <span>${story.archived ? "Archived" : `Updated ${formatDate(story.updatedAt)}`}</span>
            <div class="meter"><span style="width:${progress}%"></span></div>
          </div>
        </article>
      `;
    })
    .join("");
  updateLastEditedMeta();
  renderHeroBooks();
  renderProfile();
}

function renderStoryLibrary() {
  const query = storySearch.value.trim().toLowerCase();
  const filteredStories = [...state.stories]
    .filter((story) => {
      const haystack = [
        story.title,
        story.genre,
        story.tags,
        story.description,
        story.characters
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = haystack.includes(query);
      return matchesSearch;
    })
    .sort((first, second) => {
      if (sortStories.value === "Alphabetical") {
        return first.title.localeCompare(second.title);
      }
      if (sortStories.value === "Word count") {
        return storyWordCount(second) - storyWordCount(first);
      }
      if (sortStories.value === "Creation date") {
        return new Date(second.createdAt) - new Date(first.createdAt);
      }
      return new Date(second.updatedAt) - new Date(first.updatedAt);
    });

  storyDisplay.innerHTML = filteredStories
    .map((story) => {
      const selectedClass = story.id === state.selectedStoryId ? "is-selected" : "";
      return `
        <article class="library-card ${selectedClass}" data-story-id="${story.id}">
          <button class="library-delete" type="button" data-delete-story="${story.id}" aria-label="Delete ${escapeHtml(story.title)}" title="Delete story">×</button>
          <div class="${coverClassFor(story, "library-cover")}" style="${coverStyleFor(story)}">${coverTitleHtml(story)}</div>
          <div class="library-copy">
            <h4>${escapeHtml(story.title)}</h4>
            <p>${escapeHtml(story.genre)}</p>
            <div class="library-meta">
              <span>${storyWordCount(story).toLocaleString()} words</span>
              <span>${relativeEditedLabel(story.updatedAt)}</span>
            </div>
          </div>
          <div class="meter"><span style="width:${Math.min(100, Math.max(14, story.chapters.length * 18))}%"></span></div>
        </article>
      `;
    })
    .join("");

  const selectedStory = getStoryById(state.selectedStoryId) || filteredStories[0] || state.stories[0];
  if (selectedStory) {
    state.selectedStoryId = selectedStory.id;
    selectedStoryName.textContent = selectedStory.title;
    applyCover(selectionCover, selectedStory, "selection-cover library-cover");
  }
  renderStoryTagChips();
  renderProfile();
  persistState();
}

function renderStoryGoal(story) {
  if (!storyGoalInput) return;
  const goal = story.goal || 0;
  storyGoalInput.value = goal > 0 ? String(goal) : "";
  if (!storyGoalProgress) return;
  if (goal > 0) {
    const words = storyWordCount(story);
    const pct = Math.min(100, Math.round((words / goal) * 100));
    storyGoalProgress.hidden = false;
    storyGoalProgress.classList.toggle("is-complete", words >= goal);
    if (storyGoalLabel) {
      storyGoalLabel.textContent = `${words.toLocaleString()} / ${goal.toLocaleString()} words`;
    }
    if (storyGoalPercent) storyGoalPercent.textContent = `${pct}%${words >= goal ? " ✓" : ""}`;
    if (storyGoalBar) storyGoalBar.style.width = `${pct}%`;
  } else {
    storyGoalProgress.hidden = true;
  }
}

function renderWorkspace() {
  const story = getCurrentStory();
  if (!story) return;

  if (!story.chapters.length) {
    story.chapters.push({
      id: createId("chapter"),
      title: "New Chapter",
      tags: "",
      text: "",
      comments: []
    });
  }

  const chapter = getCurrentChapter() || story.chapters[0];
  state.currentChapterId = chapter.id;
  state.selectedStoryId = story.id;

  workspaceStoryHeading.textContent = story.title;
  workspaceStoryMeta.textContent = `${story.genre} • ${storyWordCount(story).toLocaleString()} words • ${storyPageCount(story)} A6 pages`;
  applyCover(workspaceCover, story, "workspace-cover library-cover");

  storyTitleInput.value = story.title;
  storyGenreInput.value = story.genre;
  storyDescriptionInput.value = story.description;
  storyNotesInput.value = story.notes || "";
  storyTagsInput.value = story.tags;
  renderStoryGoal(story);

  chapterList.innerHTML = story.chapters
    .map((item, index) => {
      const activeClass = item.id === chapter.id ? "active" : "";
      return `
        <div class="chapter-item ${activeClass}" data-chapter-id="${item.id}" draggable="true">
          <span class="chapter-grip" aria-hidden="true" title="Drag to reorder">⠿</span>
          <span class="chapter-item-main">
            <span class="chapter-item-title">${(index + 1).toString().padStart(2, "0")}. ${escapeHtml(item.title)}</span>
            <small>${countWords(item.text).toLocaleString()} words</small>
          </span>
          <button class="chapter-delete" type="button" data-chapter-delete="${item.id}" aria-label="Delete chapter" title="Delete chapter">×</button>
        </div>
      `;
    })
    .join("");

  chapterTitleInput.value = chapter.title;
  chapterMetaSecondaryLabel.textContent = isReaderView ? "Open Comments" : "Chapter Tags";
  chapterTagsInput.value = isReaderView ? "" : chapter.tags;
  chapterTagsInput.readOnly = isReaderView;
  if (chapter.richText) {
    storyEditor.innerHTML = chapter.richText;
  } else {
    storyEditor.textContent = chapter.text || "";
  }
  renderCharacterList();
  renderReaderSurface();
  renderReaderComments();
  renderEditorBar();
  updateReaderMode();
  updateFocusButtonLabel();
  updateSelectionToolbar();
  chapterSummaryText.textContent = `${countWords(chapter.text).toLocaleString()} words • ${estimateA6Pages(
    countWords(chapter.text)
  )} estimated A6 pages`;

  renderStoryLibrary();
  persistState();
}

function refreshWorkspaceHeader() {
  const story = getCurrentStory();
  const chapter = getCurrentChapter();
  if (!story || !chapter) return;

  workspaceStoryHeading.textContent = story.title;
  workspaceStoryMeta.textContent = `${story.genre} • ${storyWordCount(story).toLocaleString()} words • ${storyPageCount(story)} A6 pages`;
  chapterSummaryText.textContent = `${countWords(chapter.text).toLocaleString()} words • ${estimateA6Pages(
    countWords(chapter.text)
  )} estimated A6 pages`;
  selectedStoryName.textContent = story.title;
  applyCover(selectionCover, story, "selection-cover library-cover");
}

function selectStory(storyId, openWorkspace = false) {
  const story = getStoryById(storyId);
  if (!story) return;
  state.selectedStoryId = story.id;
  state.currentStoryId = story.id;
  state.currentChapterId = story.chapters[0]?.id || null;
  renderStoryLibrary();
  if (openWorkspace) {
    openPage("workspace");
  } else {
    persistState();
  }
}

function createStory() {
  const newStory = {
    id: createId("story"),
    title: "Untitled Story",
    genre: "New Fiction",
    description: "A new story waiting for its first clear sentence.",
    notes: "",
    goal: 0,
    tags: "draft, new idea",
    characters: [
      {
        id: createId("character"),
        name: "",
        description: ""
      }
    ],
    coverClass: "cover-rose",
    coverImage: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false,
    published: false,
    chapters: [
      {
        id: createId("chapter"),
        title: "Chapter One",
        tags: "opening",
        text: "",
        comments: []
      }
    ]
  };

  state.stories.unshift(newStory);
  state.selectedStoryId = newStory.id;
  state.currentStoryId = newStory.id;
  state.currentChapterId = newStory.chapters[0].id;
  recordActivity("New story created", `Started “${newStory.title}”.`);
  resetWordBaseline();
  persistState();
  renderDashboardMetrics();
  renderRecentStories();
  renderStoryLibrary();
  renderProfile();
  openPage("workspace");
}

function deleteStory(storyId) {
  const index = state.stories.findIndex((story) => story.id === storyId);
  if (index === -1) return;
  const [removed] = state.stories.splice(index, 1);
  recordActivity("Story removed", `Deleted “${removed.title}”.`);

  // Repoint selection/current story to a sensible neighbour.
  if (state.currentStoryId === storyId) {
    const next = state.stories[index] || state.stories[index - 1] || state.stories[0] || null;
    state.currentStoryId = next ? next.id : null;
    state.currentChapterId = next ? next.chapters[0]?.id || null : null;
  }
  if (state.selectedStoryId === storyId) {
    state.selectedStoryId = state.stories[0] ? state.stories[0].id : null;
  }

  resetWordBaseline();
  persistState();
  renderDashboardMetrics();
  renderRecentStories();
  renderStoryLibrary();
  if (getCurrentStory()) renderWorkspace();
  renderProfile();
}

function addChapter() {
  const story = getCurrentStory();
  if (!story) return;
  const newChapter = {
    id: createId("chapter"),
    title: `Chapter ${story.chapters.length + 1}`,
    tags: "",
    text: "",
    comments: []
  };
  story.chapters.push(newChapter);
  state.currentChapterId = newChapter.id;
  touchStory(story);
  renderWorkspace();
}

function deleteChapter(chapterId) {
  const story = getCurrentStory();
  if (!story) return;
  const index = story.chapters.findIndex((c) => c.id === chapterId);
  if (index === -1) return;
  const chapter = story.chapters[index];
  const title = chapter.title || "Untitled Chapter";

  const confirmed = window.confirm(
    `Delete chapter “${title}”?\n\nThis permanently removes the chapter and everything written in it. This cannot be undone.`
  );
  if (!confirmed) return;

  story.chapters.splice(index, 1);

  // Always keep at least one chapter to write in.
  if (!story.chapters.length) {
    story.chapters.push({
      id: createId("chapter"),
      title: "Chapter One",
      tags: "",
      text: "",
      comments: []
    });
  }

  // If the open chapter was deleted, fall back to a neighbour.
  if (state.currentChapterId === chapterId) {
    const next = story.chapters[index] || story.chapters[index - 1] || story.chapters[0];
    state.currentChapterId = next ? next.id : null;
  }

  touchStory(story);
  renderWorkspace();
  resetWordBaseline();
}

function archiveCurrentStory() {
  const story = getCurrentStory();
  if (!story) return;
  story.published = !story.published;
  recordActivity(
    story.published ? "Story published" : "Story unpublished",
    `“${story.title}” is now ${story.published ? "published" : "a draft"}.`
  );
  touchStory(story);
  renderDashboardMetrics();
  renderWorkspace();
}

function renderCharacterList() {
  const story = getCurrentStory();
  if (!story) return;

  characterList.innerHTML = story.characters
    .map(
      (character) => `
        <article class="character-card" data-character-id="${character.id}">
          <label class="stack-field">
            <span>Name</span>
            <input class="character-name-input" data-character-field="name" type="text" value="${escapeHtml(
              character.name
            )}" placeholder="Character name" />
          </label>
          <label class="stack-field">
            <span>Description</span>
            <textarea class="character-description-input" data-character-field="description" rows="3" placeholder="Description, role, or notes...">${escapeHtml(
              character.description
            )}</textarea>
          </label>
        </article>
      `
    )
    .join("");

  if (!story.characters.length) {
    characterList.innerHTML = `
      <article class="character-card character-card-empty">
        <p class="muted">No characters yet. Add one to start building your cast.</p>
      </article>
    `;
  }
}

function addCharacter() {
  const story = getCurrentStory();
  if (!story) return;
  story.characters.push({
    id: createId("character"),
    name: "",
    description: ""
  });
  touchStory(story);
  renderWorkspace();
}

function updateCharacterField(characterId, field, value) {
  const story = getCurrentStory();
  if (!story) return;
  const character = story.characters.find((item) => item.id === characterId);
  if (!character) return;
  character[field] = value;
  touchStory(story);
  renderRecentStories();
  renderStoryLibrary();
}

function addReaderComment() {
  const chapter = getCurrentChapter();
  const story = getCurrentStory();
  if (!chapter || !story || !currentReaderSelection) {
    flashReaderHint();
    return;
  }
  chapter.highlights = Array.isArray(chapter.highlights) ? chapter.highlights : [];
  const id = createId("highlight");
  chapter.highlights.push({
    id,
    kind: "comment",
    start: currentReaderSelection.start,
    end: currentReaderSelection.end,
    color: "comment",
    comment: "",
    completed: false,
    text: currentReaderSelection.text
  });

  currentReaderSelection = null;
  setReaderBarActive(false);
  if (readerSelectionToolbar) readerSelectionToolbar.hidden = true;
  touchStory(story);
  renderReaderSurface();
  renderReaderComments();
  // Open the balloon so the comment can be written/completed right away.
  const mark = readerSurface.querySelector(`[data-highlight-id="${id}"]`);
  if (mark) {
    openCommentBalloon(id, mark);
    commentBalloonText.focus();
  }
}

function applyReaderHighlight(color) {
  const chapter = getCurrentChapter();
  const story = getCurrentStory();
  if (!chapter || !story || !currentReaderSelection) {
    flashReaderHint();
    return;
  }

  chapter.highlights = Array.isArray(chapter.highlights) ? chapter.highlights : [];
  const sel = currentReaderSelection;
  // Any plain highlight overlapping the selection is "the same one" for toggling.
  const overlapping = chapter.highlights.filter(
    (h) => h.kind !== "comment" && h.start < sel.end && h.end > sel.start
  );
  if (overlapping.length) {
    const allSameColor = overlapping.every((h) => (h.color || "") === color);
    // Remove the overlapping highlight(s).
    chapter.highlights = chapter.highlights.filter((h) => !overlapping.includes(h));
    // Same colour → toggle off. Different colour → re-highlight in the new colour.
    if (!allSameColor) {
      chapter.highlights.push({
        id: createId("highlight"),
        kind: "highlight",
        start: sel.start,
        end: sel.end,
        color,
        completed: false,
        text: sel.text
      });
    }
  } else {
    chapter.highlights.push({
      id: createId("highlight"),
      kind: "highlight",
      start: sel.start,
      end: sel.end,
      color,
      completed: false,
      text: sel.text
    });
  }

  currentReaderSelection = null;
  setReaderBarActive(false);
  if (readerSelectionToolbar) readerSelectionToolbar.hidden = true;
  touchStory(story);
  renderReaderSurface();
  renderReaderComments();
}

function setReaderBarActive(active) {
  if (editorBarReader) editorBarReader.classList.toggle("is-active", Boolean(active));
}

function flashReaderHint() {
  if (!editorBarReader) return;
  editorBarReader.classList.add("needs-selection");
  setTimeout(() => editorBarReader.classList.remove("needs-selection"), 700);
}

// --- Comment balloon (hover to view/edit a comment) ---
let activeCommentId = null;
let balloonHideTimer = null;

function openCommentBalloon(id, anchorEl) {
  const chapter = getCurrentChapter();
  if (!chapter || !commentBalloon || !anchorEl) return;
  const highlight = (chapter.highlights || []).find((h) => h.id === id);
  if (!highlight) return;
  activeCommentId = id;
  commentBalloonText.value = highlight.comment || "";
  if (commentBalloonComplete) {
    commentBalloonComplete.textContent = highlight.completed ? "Reopen" : "Mark done";
  }
  const surface = anchorEl.closest(".editor-surface");
  if (!surface) return;
  commentBalloon.hidden = false;
  const aRect = anchorEl.getBoundingClientRect();
  const sRect = surface.getBoundingClientRect();
  let left = aRect.left - sRect.left + surface.scrollLeft;
  const top = aRect.bottom - sRect.top + surface.scrollTop + 8;
  const maxLeft = surface.clientWidth - commentBalloon.offsetWidth - 12;
  left = Math.max(12, Math.min(left, Math.max(12, maxLeft)));
  commentBalloon.style.left = `${left}px`;
  commentBalloon.style.top = `${top}px`;
}

function hideCommentBalloon() {
  if (!commentBalloon) return;
  commentBalloon.hidden = true;
  activeCommentId = null;
}

function scheduleHideBalloon() {
  clearTimeout(balloonHideTimer);
  balloonHideTimer = setTimeout(() => {
    if (!commentBalloon || commentBalloon.hidden) return;
    if (commentBalloon.matches(":hover")) return;
    if (commentBalloon.contains(document.activeElement)) return;
    hideCommentBalloon();
  }, 320);
}

function saveBalloonComment() {
  const chapter = getCurrentChapter();
  const story = getCurrentStory();
  if (!chapter || !story || !activeCommentId) return;
  const highlight = (chapter.highlights || []).find((h) => h.id === activeCommentId);
  if (!highlight) return;
  highlight.comment = commentBalloonText.value.trim();
  if (!highlight.comment) {
    // An emptied comment is removed.
    chapter.highlights = chapter.highlights.filter((h) => h.id !== activeCommentId);
  }
  hideCommentBalloon();
  touchStory(story);
  renderReaderSurface();
  renderReaderComments();
}

function toggleBalloonComplete() {
  const chapter = getCurrentChapter();
  const story = getCurrentStory();
  if (!chapter || !story || !activeCommentId) return;
  const highlight = (chapter.highlights || []).find((h) => h.id === activeCommentId);
  if (!highlight) return;
  highlight.completed = !highlight.completed;
  hideCommentBalloon();
  touchStory(story);
  renderReaderSurface();
  renderReaderComments();
}

function deleteBalloonComment() {
  const chapter = getCurrentChapter();
  const story = getCurrentStory();
  if (!chapter || !story || !activeCommentId) return;
  chapter.highlights = (chapter.highlights || []).filter((h) => h.id !== activeCommentId);
  hideCommentBalloon();
  touchStory(story);
  renderReaderSurface();
  renderReaderComments();
}

function getTextOffset(root, container, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (currentNode === container) {
      return total + offset;
    }
    total += currentNode.textContent.length;
    currentNode = walker.nextNode();
  }

  return total;
}

function captureReaderSelection() {
  if (!isReaderView) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    currentReaderSelection = null;
    setReaderBarActive(false);
    return;
  }

  const range = selection.getRangeAt(0);
  if (!readerSurface.contains(range.commonAncestorContainer)) {
    currentReaderSelection = null;
    setReaderBarActive(false);
    return;
  }

  const rawStart = getTextOffset(readerSurface, range.startContainer, range.startOffset);
  const rawEnd = getTextOffset(readerSurface, range.endContainer, range.endOffset);
  const chapter = getCurrentChapter();
  if (!chapter) return;

  const fullText = chapter.text || "";
  let start = Math.min(rawStart, rawEnd);
  let end = Math.max(rawStart, rawEnd);
  // Trim whitespace from the ends so the highlight hugs the actual words.
  while (start < end && /\s/.test(fullText[start])) start += 1;
  while (end > start && /\s/.test(fullText[end - 1])) end -= 1;
  const selectedText = fullText.slice(start, end);
  if (!selectedText.trim()) {
    currentReaderSelection = null;
    setReaderBarActive(false);
    return;
  }

  currentReaderSelection = { start, end, text: selectedText };
  setReaderBarActive(true);
}

function toggleReaderHighlightComplete(highlightId) {
  const chapter = getCurrentChapter();
  const story = getCurrentStory();
  if (!chapter || !story) return;
  const highlight = (chapter.highlights || []).find((item) => item.id === highlightId);
  if (!highlight || !highlight.comment) return;
  highlight.completed = !highlight.completed;
  touchStory(story);
  renderReaderSurface();
  renderReaderComments();
}

function updateStoryField(field, value) {
  const story = getCurrentStory();
  if (!story) return;
  story[field] = field === "goal" ? Number(value) || 0 : value;
  touchStory(story);
  refreshWorkspaceHeader();
  renderStoryLibrary();
  renderRecentStories();
  if (field === "goal") {
    renderStoryGoal(story);
    renderDashboardMetrics();
  }
}

function updateChapterField(field, value) {
  const story = getCurrentStory();
  const chapter = getCurrentChapter();
  if (!story || !chapter) return;
  chapter[field] = value;
  touchStory(story);
  refreshWorkspaceHeader();
  renderStoryLibrary();
  renderRecentStories();
  if (field === "title") {
    renderWorkspace();
  }
}

// Resize + JPEG-compress an uploaded image so it stays small enough to live
// inside the Firestore user document (which has a 1 MB limit).
function compressImage(file, maxDim = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (Math.max(width, height) > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (error) {
          resolve(String(reader.result)); // fallback to original
        }
      };
      img.onerror = () => resolve(String(reader.result));
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleCoverUpload(file) {
  if (!file) return;
  try {
    const dataUrl = await compressImage(file, 1000, 0.82);
    const story = getCurrentStory();
    if (!story) return;
    story.coverImage = dataUrl;
    touchStory(story);
    renderWorkspace();
    renderStoryLibrary();
    renderRecentStories();
  } catch (error) {
    console.error("Unable to process cover image", error);
  }
}

async function handleAuthorPhotoUpload(file) {
  if (!file) return;
  try {
    state.profileImage = await compressImage(file, 480, 0.85);
    persistState();
    renderAuthorPhoto();
    renderProfile();
    renderSettings();
  } catch (error) {
    console.error("Unable to process author photo", error);
  }
}

function exportChosenStory() {
  const story = getStoryById(state.selectedStoryId) || getCurrentStory();
  if (!story) return;
  exportStoryAsEpub(story);
  recordActivity("Exported EPUB", `“${story.title}” exported successfully.`);
  persistState();
  renderDashboardMetrics();
}

function storyToXhtmlParagraphs(text) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => `<p>${escapeHtml(block).replaceAll("\n", "<br />")}</p>`)
    .join("\n");
}

function dataUrlToBytes(dataUrl) {
  const [, meta, base64] = dataUrl.match(/^data:(.*?);base64,(.*)$/) || [];
  if (!meta || !base64) return null;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { mimeType: meta, bytes };
}

function buildFallbackCoverPage(story) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeHtml(story.title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body class="cover-page">
    <section class="cover-panel">
      <p class="cover-kicker">TYPEMILL</p>
      <h1>${escapeHtml(story.title)}</h1>
      <p class="cover-genre">${escapeHtml(story.genre)}</p>
      <p class="cover-blurb">${escapeHtml(story.description)}</p>
    </section>
  </body>
</html>`;
}

function exportStoryAsEpub(story) {
  const chapterFiles = story.chapters.map((chapter, index) => ({
    id: `chapter-${index + 1}`,
    href: `chapters/chapter-${index + 1}.xhtml`,
    title: chapter.title,
    content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeHtml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="../styles.css" />
  </head>
  <body>
    <article class="chapter-page">
      <h1>${escapeHtml(chapter.title)}</h1>
      <p class="chapter-tags">${escapeHtml(chapter.tags || "untagged")}</p>
      ${storyToXhtmlParagraphs(chapter.text)}
    </article>
  </body>
</html>`
  }));

  const navItems = chapterFiles
    .map(
      (chapter) =>
        `<li><a href="${chapter.href}">${escapeHtml(chapter.title)}</a></li>`
    )
    .join("");

  const manifestItems = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />`,
    `<item id="styles" href="styles.css" media-type="text/css" />`,
    `<item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml" />`,
    ...chapterFiles.map(
      (chapter) =>
        `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml" />`
    )
  ];

  const spineItems = [
    `<itemref idref="cover-page" />`,
    ...chapterFiles.map((chapter) => `<itemref idref="${chapter.id}" />`)
  ];

  const files = [
    { path: "mimetype", data: stringBytes("application/epub+zip"), store: true },
    {
      path: "META-INF/container.xml",
      data: stringBytes(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)
    },
    {
      path: "OEBPS/nav.xhtml",
      data: stringBytes(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>Contents</title>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>${navItems}</ol>
    </nav>
  </body>
</html>`)
    },
    {
      path: "OEBPS/styles.css",
      data: stringBytes(`@page { size: A6; margin: 14mm; }
body { font-family: Georgia, serif; line-height: 1.6; color: #261f29; margin: 0; }
.chapter-page, .cover-panel { page-break-after: always; }
h1 { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 1.5rem; margin: 0 0 0.75rem; }
p { margin: 0 0 0.9rem; }
.chapter-tags, .cover-kicker, .cover-genre { font-family: "Helvetica Neue", Arial, sans-serif; color: #8f5870; text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.72rem; }
.cover-page { background: #fffaf8; }
.cover-panel { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 1.5rem; background: linear-gradient(160deg, #f4d7de, #ddd8f7 54%, #fff4e5); }
.cover-blurb { margin-top: 1rem; }
img.cover-image { width: 100%; height: auto; border-radius: 0.6rem; margin-top: 1.2rem; }`)
    },
    {
      path: "OEBPS/content.opf",
      data: stringBytes(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeHtml(story.id)}</dc:identifier>
    <dc:title>${escapeHtml(story.title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>TYPEMILL Author</dc:creator>
    <dc:description>${escapeHtml(story.description)}</dc:description>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
  </manifest>
  <spine>
    ${spineItems.join("\n    ")}
  </spine>
</package>`)
    }
  ];

  const coverAsset = dataUrlToBytes(story.coverImage);
  if (coverAsset) {
    const extension = coverAsset.mimeType.includes("png") ? "png" : "jpg";
    manifestItems.push(
      `<item id="cover-image" href="images/cover.${extension}" media-type="${coverAsset.mimeType}" properties="cover-image" />`
    );
    files.push({
      path: `OEBPS/images/cover.${extension}`,
      data: coverAsset.bytes
    });
    files.push({
      path: "OEBPS/cover.xhtml",
      data: stringBytes(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeHtml(story.title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body class="cover-page">
    <section class="cover-panel">
      <p class="cover-kicker">TYPEMILL</p>
      <h1>${escapeHtml(story.title)}</h1>
      <p class="cover-genre">${escapeHtml(story.genre)}</p>
      <img class="cover-image" src="images/cover.${extension}" alt="${escapeHtml(
        story.title
      )} cover" />
      <p class="cover-blurb">${escapeHtml(story.description)}</p>
    </section>
  </body>
</html>`)
    });
  } else {
    files.push({
      path: "OEBPS/cover.xhtml",
      data: stringBytes(buildFallbackCoverPage(story))
    });
  }

  chapterFiles.forEach((chapter) => {
    files.push({
      path: `OEBPS/${chapter.href}`,
      data: stringBytes(chapter.content)
    });
  });

  const epubBlob = buildZip(files);
  const downloadUrl = URL.createObjectURL(epubBlob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = `${story.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "typemill-story"}.epub`;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);

  const targetStory = getStoryById(story.id);
  if (targetStory) {
    targetStory.updatedAt = new Date().toISOString();
    persistState();
    renderStoryLibrary();
    renderRecentStories();
  }
}

function stringBytes(value) {
  return new TextEncoder().encode(value);
}

function buildZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.path);
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const crc = crc32(data);
    const compressedSize = data.length;
    const uncompressedSize = data.length;
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, file.store ? 0 : 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, compressedSize, true);
    localView.setUint32(22, uncompressedSize, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, file.store ? 0 : 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, compressedSize, true);
    centralView.setUint32(24, uncompressedSize, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord], {
    type: "application/epub+zip"
  });
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function updateSprintClock() {
  const minutes = String(Math.floor(sprintSeconds / 60)).padStart(2, "0");
  const seconds = String(sprintSeconds % 60).padStart(2, "0");
  sprintClock.textContent = `${minutes}:${seconds}`;
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (link.dataset.pageTarget === "workspace" && !getCurrentStory()) return;
    openPage(link.dataset.pageTarget);
  });
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    viewButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.activeView = button.dataset.view;
    storyDisplay.classList.toggle("grid-view", state.activeView === "grid");
    storyDisplay.classList.toggle("list-view", state.activeView === "list");
    persistState();
  });
});

storySearch.addEventListener("input", renderStoryLibrary);
sortStories.addEventListener("change", renderStoryLibrary);
function showFeedback(element, message, ok) {
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
  element.classList.toggle("is-error", !ok);
  element.classList.toggle("is-success", Boolean(ok));
}

settingsSaveAccountButton.addEventListener("click", async () => {
  if (!currentUser) {
    showFeedback(settingsAccountFeedback, "Sign in to update your account.", false);
    return;
  }
  const newEmail = settingsEmailInput.value.trim();
  const newName =
    settingsDisplayNameInput.value.trim() || state.profile.name || "Author";

  try {
    if (newName !== (currentUser.displayName || "")) {
      await updateProfile(currentUser, { displayName: newName });
    }
    if (newEmail && newEmail !== currentUser.email) {
      await updateEmail(currentUser, newEmail);
    }
    state.settings.account.email = currentUser.email || newEmail;
    state.settings.account.displayName = newName;
    state.profile.name = newName;
    persistState();
    renderProfile();
    renderSettings();
    showFeedback(settingsAccountFeedback, "Account details saved.", true);
    settingsSaveAccountButton.textContent = "Saved";
    setTimeout(() => {
      settingsSaveAccountButton.textContent = "Save changes";
    }, 1200);
  } catch (error) {
    showFeedback(settingsAccountFeedback, authErrorMessage(error), false);
  }
});

if (settingsChangePasswordButton) {
  settingsChangePasswordButton.addEventListener("click", async () => {
    if (!currentUser) {
      showFeedback(settingsPasswordFeedback, "Sign in to change your password.", false);
      return;
    }
    const isPasswordUser = currentUser.providerData.some(
      (p) => p.providerId === "password"
    );
    if (!isPasswordUser) {
      showFeedback(
        settingsPasswordFeedback,
        "Your account uses Google sign-in, so there's no password to change here.",
        false
      );
      return;
    }
    const current = settingsCurrentPasswordInput.value;
    const next = settingsNewPasswordInput.value;
    const confirm = settingsConfirmPasswordInput.value;

    if (next.length < 6) {
      showFeedback(
        settingsPasswordFeedback,
        "New password must be at least 6 characters.",
        false
      );
      return;
    }
    if (next !== confirm) {
      showFeedback(settingsPasswordFeedback, "New passwords do not match.", false);
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, current);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, next);
      settingsCurrentPasswordInput.value = "";
      settingsNewPasswordInput.value = "";
      settingsConfirmPasswordInput.value = "";
      showFeedback(settingsPasswordFeedback, "Password updated.", true);
    } catch (error) {
      const message =
        error && error.code === "auth/wrong-password"
          ? "Current password is incorrect."
          : authErrorMessage(error);
      showFeedback(settingsPasswordFeedback, message, false);
    }
  });
}

if (settingsSignOutButton) {
  settingsSignOutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out failed", error);
    }
  });
}

// "Switch account" simply signs out and returns to the gate, where any account
// can sign in. (Firebase keeps one signed-in user per browser at a time.)
if (settingsAddAccountButton) {
  settingsAddAccountButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out failed", error);
    }
  });
}

if (settingsDeleteAccountButton) {
  let deleteArmed = false;
  let deleteResetTimer;
  settingsDeleteAccountButton.addEventListener("click", async () => {
    if (!currentUser) {
      showFeedback(settingsDangerFeedback, "Sign in to manage this account.", false);
      return;
    }
    if (!deleteArmed) {
      deleteArmed = true;
      settingsDeleteAccountButton.textContent = "Click again to permanently delete";
      settingsDeleteAccountButton.classList.add("is-armed");
      showFeedback(
        settingsDangerFeedback,
        "This permanently removes your account and all its stories.",
        false
      );
      clearTimeout(deleteResetTimer);
      deleteResetTimer = setTimeout(() => {
        deleteArmed = false;
        settingsDeleteAccountButton.textContent = "Delete account";
        settingsDeleteAccountButton.classList.remove("is-armed");
        if (settingsDangerFeedback) settingsDangerFeedback.hidden = true;
      }, 4000);
      return;
    }
    const uid = currentUser.uid;
    try {
      await deleteDoc(userDocRef(uid));
      await deleteUser(currentUser);
      try {
        localStorage.removeItem(`typemill-cache::${uid}`);
      } catch (error) {
        /* best-effort */
      }
      // onAuthStateChanged will show the gate.
    } catch (error) {
      showFeedback(settingsDangerFeedback, authErrorMessage(error), false);
      deleteArmed = false;
      settingsDeleteAccountButton.textContent = "Delete account";
      settingsDeleteAccountButton.classList.remove("is-armed");
    }
  });
}

settingsJumpButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.settingsJump);
    if (!target) return;
    settingsJumpButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
settingsSprintLengthSelect.addEventListener("change", () => {
  updateSettings("writing", "sprintMinutes", Number(settingsSprintLengthSelect.value));
  sprintSeconds = Number(settingsSprintLengthSelect.value) * 60;
  updateSprintClock();
});
settingsMilestoneReminderSelect.addEventListener("change", () => {
  updateSettings("writing", "milestoneReminder", Number(settingsMilestoneReminderSelect.value));
});
settingsSyncGoalsButton.addEventListener("click", () => {
  state.goals.today = state.settings.writing.milestoneReminder;
  renderGoalCard();
  persistState();
  settingsSyncGoalsButton.textContent = "Goals Synced";
  setTimeout(() => {
    settingsSyncGoalsButton.textContent = "Sync With Sidebar Goals";
  }, 1200);
});
settingsPaletteSelect.addEventListener("change", () => {
  updateSettings("theme", "palette", settingsPaletteSelect.value);
});
settingsReducedMotionToggle.addEventListener("change", () => {
  updateSettings("theme", "reducedMotion", settingsReducedMotionToggle.checked);
});
settingsCompactSidebarToggle.addEventListener("change", () => {
  updateSettings("theme", "compactSidebar", settingsCompactSidebarToggle.checked);
});
[
  ["streaks", settingsNotifyStreaksToggle],
  ["exports", settingsNotifyExportsToggle],
  ["comments", settingsNotifyCommentsToggle],
  ["backups", settingsNotifyBackupsToggle]
].forEach(([key, input]) => {
  input.addEventListener("change", () => {
    updateSettings("notifications", key, input.checked);
  });
});
settingsBackupFrequencySelect.addEventListener("change", () => {
  updateSettings("backup", "frequency", settingsBackupFrequencySelect.value);
});
settingsDownloadBackupButton.addEventListener("click", () => {
  downloadJsonFile("typemill-backup.json", {
    exportedAt: new Date().toISOString(),
    state
  });
});
settingsExportLibraryButton.addEventListener("click", () => {
  downloadJsonFile("typemill-story-library.json", {
    exportedAt: new Date().toISOString(),
    stories: state.stories
  });
});
settingsRestoreButton.addEventListener("click", () => {
  settingsRestoreInput.click();
});
settingsRestoreInput.addEventListener("change", async () => {
  const file = settingsRestoreInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const nextState = parsed.state || parsed;
    state = hydrateState(nextState);
    persistState();
    renderAll();
  } catch (error) {
    console.error("Unable to restore backup", error);
  } finally {
    settingsRestoreInput.value = "";
  }
});

[
  ["today", goalTodayInput],
  ["week", goalWeekInput],
  ["month", goalMonthInput],
  ["year", goalYearInput]
].forEach(([key, input]) => {
  input.addEventListener("input", () => {
    state.goals[key] = Number(input.value) || 0;
    renderGoalCard();
    persistState();
  });
});

storyDisplay.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const deleteButton = target.closest("[data-delete-story]");
  if (deleteButton) {
    event.stopPropagation();
    const story = getStoryById(deleteButton.dataset.deleteStory);
    if (!story) return;
    const confirmed = window.confirm(
      `Delete “${story.title}”? This permanently removes the story and all its chapters and can't be undone.`
    );
    if (confirmed) deleteStory(story.id);
    return;
  }

  const card = target.closest("[data-story-id]");
  if (card) {
    selectStory(card.dataset.storyId, true);
  }
});

openSelectedStoryButton.addEventListener("click", () => {
  selectStory(state.selectedStoryId, true);
});
exportTopbarButton.addEventListener("click", exportChosenStory);
backToStoriesButton.addEventListener("click", () => {
  openPage("stories");
});

// Collapse the main navigation sidebar to widen the workspace + editor.
const sidebarToggle = document.getElementById("sidebarToggle");
function applySidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  if (sidebarToggle) {
    sidebarToggle.title = collapsed ? "Show menu" : "Hide menu";
    sidebarToggle.setAttribute("aria-label", collapsed ? "Show menu" : "Hide menu");
    sidebarToggle.classList.toggle("is-collapsed", collapsed);
  }
}
let sidebarCollapsed = false;
try {
  sidebarCollapsed = localStorage.getItem("typemill-sidebar-collapsed") === "1";
} catch (error) {
  /* ignore */
}
applySidebarCollapsed(sidebarCollapsed);
if (sidebarToggle) {
  sidebarToggle.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    try {
      localStorage.setItem("typemill-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch (error) {
      /* ignore */
    }
    applySidebarCollapsed(sidebarCollapsed);
  });
}

continueWritingButton.addEventListener("click", () => {
  selectStory(state.selectedStoryId, true);
});

document.querySelectorAll("[data-action='new-story']").forEach((button) => {
  button.addEventListener("click", createStory);
});

document.querySelectorAll("[data-action='export-story']").forEach((button) => {
  button.addEventListener("click", exportChosenStory);
});

document.querySelectorAll("[data-action='upload-cover']").forEach((button) => {
  button.addEventListener("click", () => {
    openPage("workspace");
    coverUploadInput.click();
  });
});

document.querySelectorAll("[data-action='calendar']").forEach((button) => {
  button.addEventListener("click", () => {
    openPage("dashboard");
    const panel = document.querySelector(".heatmap-panel");
    if (!panel) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    panel.classList.add("is-flash");
    setTimeout(() => panel.classList.remove("is-flash"), 1200);
  });
});

storyTitleInput.addEventListener("input", (event) => {
  updateStoryField("title", event.target.value || "Untitled Story");
});

storyGenreInput.addEventListener("input", (event) => {
  updateStoryField("genre", event.target.value || "New Fiction");
});

if (storyGoalInput) {
  storyGoalInput.addEventListener("input", (event) => {
    updateStoryField("goal", event.target.value);
  });
}

storyDescriptionInput.addEventListener("input", (event) => {
  updateStoryField("description", event.target.value);
});

storyNotesInput.addEventListener("input", (event) => {
  updateStoryField("notes", event.target.value);
});

storyTagsInput.addEventListener("input", (event) => {
  updateStoryField("tags", event.target.value);
});

chapterTitleInput.addEventListener("input", (event) => {
  updateChapterField("title", event.target.value || "Untitled Chapter");
});

chapterTagsInput.addEventListener("input", (event) => {
  if (isReaderView) return;
  updateChapterField("tags", event.target.value);
});

storyEditor.addEventListener("input", () => {
  commitEditorContent();
  trackWordProgress();
});

addChapterButton.addEventListener("click", addChapter);
addCharacterButton.addEventListener("click", addCharacter);
// Cover menu: clicking the workspace cover offers Upload / Remove.
const coverMenu = document.getElementById("coverMenu");
const coverUploadOption = document.getElementById("coverUploadOption");
const coverRemoveOption = document.getElementById("coverRemoveOption");

function closeCoverMenu() {
  if (coverMenu) coverMenu.hidden = true;
}

workspaceCoverButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!coverMenu) {
    coverUploadInput.click();
    return;
  }
  const story = getCurrentStory();
  // Only offer "Remove" when there's actually a photo to remove.
  if (coverRemoveOption) {
    coverRemoveOption.hidden = !(story && story.coverImage);
  }
  coverMenu.hidden = !coverMenu.hidden;
});

if (coverUploadOption) {
  coverUploadOption.addEventListener("click", () => {
    closeCoverMenu();
    coverUploadInput.click();
  });
}

if (coverRemoveOption) {
  coverRemoveOption.addEventListener("click", () => {
    closeCoverMenu();
    const story = getCurrentStory();
    if (!story || !story.coverImage) return;
    story.coverImage = "";
    touchStory(story);
    renderWorkspace();
    renderStoryLibrary();
    renderRecentStories();
    renderProfile();
  });
}

document.addEventListener("click", (event) => {
  if (!coverMenu || coverMenu.hidden) return;
  if (event.target.closest(".workspace-cover-wrap")) return;
  closeCoverMenu();
});

sidebarAvatarButton.addEventListener("click", () => authorPhotoInput.click());
profileAvatarButton.addEventListener("click", () => authorPhotoInput.click());
authorPhotoInput.addEventListener("change", () => {
  handleAuthorPhotoUpload(authorPhotoInput.files?.[0]);
  authorPhotoInput.value = "";
});
coverUploadInput.addEventListener("change", () => {
  handleCoverUpload(coverUploadInput.files?.[0]);
  coverUploadInput.value = "";
});

characterList.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  const card = target.closest("[data-character-id]");
  if (!card) return;
  const field = target.dataset.characterField;
  if (!field) return;
  updateCharacterField(card.dataset.characterId, field, target.value);
});

readerSurface.addEventListener("mouseup", captureReaderSelection);
readerHighlightPinkButton.addEventListener("click", () => applyReaderHighlight("pink"));
readerHighlightYellowButton.addEventListener("click", () => applyReaderHighlight("yellow"));
readerHighlightBlueButton.addEventListener("click", () => applyReaderHighlight("blue"));
readerCommentButton.addEventListener("click", addReaderComment);
readerCommentList.addEventListener("dblclick", (event) => {
  const item = event.target.closest("[data-highlight-id]");
  if (!item) return;
  toggleReaderHighlightComplete(item.dataset.highlightId);
});

// --- Full-width editor bar: writing display settings ---
function setEditorSetting(key, value) {
  state.settings.editor = state.settings.editor || { ...DEFAULT_SETTINGS.editor };
  state.settings.editor[key] = value;
  applyEditorSettings();
  persistState();
}
if (editorFontSelect) {
  editorFontSelect.addEventListener("change", () => {
    setEditorSetting("font", editorFontSelect.value);
    renderEditorBar();
  });
}
if (editorAlignGroup) {
  editorAlignGroup.querySelectorAll("[data-align]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setEditorSetting("align", btn.dataset.align);
      renderEditorBar();
    });
  });
}
if (editorIndentButton) {
  editorIndentButton.addEventListener("click", () => {
    const editor = state.settings.editor || DEFAULT_SETTINGS.editor;
    setEditorSetting("indent", !editor.indent);
    renderEditorBar();
  });
}

// --- Full-width editor bar: reader highlight/comment tools ---
if (editorBarReader) {
  editorBarReader.querySelectorAll("[data-hl]").forEach((button) => {
    button.addEventListener("click", () => applyReaderHighlight(button.dataset.hl));
  });
}
if (barCommentButton) {
  barCommentButton.addEventListener("click", addReaderComment);
}

// --- Comment balloon: hover to view/edit ---
readerSurface.addEventListener("mouseover", (event) => {
  const mark = event.target.closest(".reader-comment-mark");
  if (!mark) return;
  clearTimeout(balloonHideTimer);
  openCommentBalloon(mark.dataset.highlightId, mark);
});
readerSurface.addEventListener("mouseout", (event) => {
  if (event.target.closest(".reader-comment-mark")) scheduleHideBalloon();
});
if (commentBalloon) {
  commentBalloon.addEventListener("mouseenter", () => clearTimeout(balloonHideTimer));
  commentBalloon.addEventListener("mouseleave", scheduleHideBalloon);
}
if (commentBalloonSave) commentBalloonSave.addEventListener("click", saveBalloonComment);
if (commentBalloonComplete) commentBalloonComplete.addEventListener("click", toggleBalloonComplete);
if (commentBalloonDelete) commentBalloonDelete.addEventListener("click", deleteBalloonComment);

profileShowcaseGrid.addEventListener("click", (event) => {
  const target = event.target.closest("[data-story-open]");
  if (!target) return;
  selectStory(target.dataset.storyOpen, true);
});

[
  ["name", profileNameInput],
  ["role", profileRoleInput],
  ["location", profileLocationInput],
  ["signature", profileSignatureInput],
  ["genres", profileGenresInput],
  ["bio", profileBioInput],
  ["website", profileWebsiteInput],
  ["instagram", profileInstagramInput],
  ["newsletter", profileNewsletterInput],
  ["tiktok", profileTiktokInput]
].forEach(([key, input]) => {
  input.addEventListener("input", (event) => {
    updateProfileField(key, event.target.value);
  });
});

chapterList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-chapter-delete]");
  if (deleteButton) {
    event.stopPropagation();
    deleteChapter(deleteButton.dataset.chapterDelete);
    return;
  }
  const target = event.target.closest("[data-chapter-id]");
  if (!target) return;
  state.currentChapterId = target.dataset.chapterId;
  // Open straight into this chapter's text editor.
  if (isReaderView) {
    isReaderView = false;
    updateReaderMode();
  }
  renderWorkspace();
  storyEditor.scrollIntoView({ behavior: "smooth", block: "center" });
  storyEditor.focus({ preventScroll: true });
});

let draggedChapterId = null;

chapterList.addEventListener("dragstart", (event) => {
  const target = event.target.closest("[data-chapter-id]");
  if (!target) return;
  draggedChapterId = target.dataset.chapterId;
  target.classList.add("dragging");
});

chapterList.addEventListener("dragend", (event) => {
  const target = event.target.closest("[data-chapter-id]");
  if (!target) return;
  target.classList.remove("dragging");
});

chapterList.addEventListener("dragover", (event) => {
  event.preventDefault();
});

chapterList.addEventListener("drop", (event) => {
  event.preventDefault();
  const dropTarget = event.target.closest("[data-chapter-id]");
  const story = getCurrentStory();
  if (!dropTarget || !story || !draggedChapterId || dropTarget.dataset.chapterId === draggedChapterId) {
    return;
  }

  const fromIndex = story.chapters.findIndex((chapter) => chapter.id === draggedChapterId);
  const toIndex = story.chapters.findIndex((chapter) => chapter.id === dropTarget.dataset.chapterId);
  if (fromIndex < 0 || toIndex < 0) return;

  const [movedChapter] = story.chapters.splice(fromIndex, 1);
  story.chapters.splice(toIndex, 0, movedChapter);
  touchStory(story);
  renderWorkspace();
});

focusModeToggle.addEventListener("click", () => {
  workspaceShell.classList.toggle("focus-mode");
  updateFocusButtonLabel();
});

readerViewToggle.addEventListener("click", () => {
  isReaderView = !isReaderView;
  updateReaderMode();
});

sprintToggleButton.addEventListener("click", () => {
  const isHidden = sprintPanel.hidden;
  sprintPanel.hidden = !isHidden;
  sprintToggleButton.classList.toggle("is-open", isHidden);
});

document.querySelectorAll("[data-format]").forEach((button) => {
  button.addEventListener("click", () => {
    applyFormat(button.dataset.format);
  });
});

["mouseup", "keyup", "select"].forEach((eventName) => {
  storyEditor.addEventListener(eventName, updateSelectionToolbar);
});

storyEditor.addEventListener("blur", () => {
  setTimeout(updateSelectionToolbar, 0);
});

readerSurface.addEventListener("mousedown", () => {
  if (!isReaderView) return;
  readerSelectionToolbar.hidden = true;
});

readerSurface.addEventListener("dblclick", (event) => {
  const highlight = event.target.closest("[data-highlight-id]");
  if (!highlight) return;
  toggleReaderHighlightComplete(highlight.dataset.highlightId);
});

startSprint.addEventListener("click", () => {
  if (sprintInterval) {
    clearInterval(sprintInterval);
    sprintInterval = null;
    startSprint.textContent = "Start";
    return;
  }

  startSprint.textContent = "Pause";
  sprintInterval = setInterval(() => {
    sprintSeconds -= 1;
    updateSprintClock();
    if (sprintSeconds <= 0) {
      clearInterval(sprintInterval);
      sprintInterval = null;
      sprintSeconds = 25 * 60;
      startSprint.textContent = "Start";
      updateSprintClock();
    }
  }, 1000);
});

resetSprint.addEventListener("click", () => {
  clearInterval(sprintInterval);
  sprintInterval = null;
  sprintSeconds = 25 * 60;
  startSprint.textContent = "Start";
  updateSprintClock();
});

// ---------------------------------------------------------------------------
// Writer Journal — persistent, editable entries with @story tags
// ---------------------------------------------------------------------------
let editingJournalId = null;

// Which stories are tagged in this entry (a story is tagged if "@Title" appears).
function deriveJournalTags(content) {
  return state.stories
    .filter((story) => story.title && content.includes(`@${story.title}`))
    .map((story) => story.id);
}

// Render entry text with @story mentions as clickable chips.
function renderJournalContent(content) {
  let html = escapeHtml(content);
  // Longest titles first so overlapping names match correctly.
  [...state.stories]
    .filter((s) => s.title)
    .sort((a, b) => b.title.length - a.title.length)
    .forEach((story) => {
      const token = `@${escapeHtml(story.title)}`;
      if (html.includes(token)) {
        html = html
          .split(token)
          .join(
            `<a class="journal-mention" data-story-open="${story.id}">@${escapeHtml(
              story.title
            )}</a>`
          );
      }
    });
  return html.replace(/\n/g, "<br>");
}

function renderJournal() {
  if (!journalTimeline) return;
  const entries = [...(state.journal || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (!entries.length) {
    journalTimeline.innerHTML =
      '<p class="muted journal-empty">No entries yet. Capture a reflection above — type <strong>@</strong> to tag a story.</p>';
    return;
  }
  journalTimeline.innerHTML = entries
    .map(
      (entry) => `
      <article class="timeline-card" data-journal-id="${entry.id}">
        <div class="timeline-head">
          <span class="timeline-date">${escapeHtml(relativeFromNow(entry.ts))}${
        entry.edited ? " · edited" : ""
      }</span>
          <div class="timeline-actions">
            <button class="journal-action" type="button" data-journal-edit="${entry.id}">Edit</button>
            <button class="journal-action journal-action-danger" type="button" data-journal-delete="${entry.id}">Delete</button>
          </div>
        </div>
        <p>${renderJournalContent(entry.content || "")}</p>
      </article>`
    )
    .join("");
}

function resetJournalComposer() {
  editingJournalId = null;
  journalEntryInput.value = "";
  postJournalEntry.textContent = "Post Update";
  if (journalEditingHint) journalEditingHint.hidden = true;
  if (cancelJournalEdit) cancelJournalEdit.hidden = true;
  hideMentionDropdown();
}

function submitJournalEntry() {
  const content = journalEntryInput.value.trim();
  if (!content) return;
  if (!Array.isArray(state.journal)) state.journal = [];

  if (editingJournalId) {
    const entry = state.journal.find((item) => item.id === editingJournalId);
    if (entry) {
      entry.content = content;
      entry.tags = deriveJournalTags(content);
      entry.edited = true;
    }
  } else {
    state.journal.unshift({
      id: createId("journal"),
      content,
      tags: deriveJournalTags(content),
      ts: Date.now(),
      edited: false
    });
  }

  resetJournalComposer();
  persistState();
  renderJournal();
}

function startEditJournal(id) {
  const entry = (state.journal || []).find((item) => item.id === id);
  if (!entry) return;
  editingJournalId = id;
  journalEntryInput.value = entry.content || "";
  postJournalEntry.textContent = "Update Entry";
  if (journalEditingHint) journalEditingHint.hidden = false;
  if (cancelJournalEdit) cancelJournalEdit.hidden = false;
  journalEntryInput.focus();
}

function deleteJournal(id) {
  if (!window.confirm("Delete this journal entry? This can't be undone.")) return;
  state.journal = (state.journal || []).filter((item) => item.id !== id);
  if (editingJournalId === id) resetJournalComposer();
  persistState();
  renderJournal();
}

// --- @story mention dropdown ---
function hideMentionDropdown() {
  if (mentionDropdown) mentionDropdown.hidden = true;
}

function currentMentionQuery() {
  const value = journalEntryInput.value;
  const caret = journalEntryInput.selectionStart;
  const before = value.slice(0, caret);
  const match = before.match(/@([^\s@]*)$/);
  return match ? match[1] : null;
}

function updateMentionDropdown() {
  if (!mentionDropdown) return;
  const query = currentMentionQuery();
  if (query === null) {
    hideMentionDropdown();
    return;
  }
  const q = query.toLowerCase();
  const matches = state.stories
    .filter((story) => story.title && story.title.toLowerCase().includes(q))
    .slice(0, 6);
  if (!matches.length) {
    hideMentionDropdown();
    return;
  }
  mentionDropdown.innerHTML = matches
    .map(
      (story) =>
        `<button type="button" class="mention-option" data-mention-id="${story.id}">@${escapeHtml(
          story.title
        )}</button>`
    )
    .join("");
  mentionDropdown.hidden = false;
}

function insertMention(story) {
  const value = journalEntryInput.value;
  const caret = journalEntryInput.selectionStart;
  const before = value.slice(0, caret).replace(/@[^\s@]*$/, `@${story.title} `);
  const after = value.slice(caret);
  journalEntryInput.value = before + after;
  const pos = before.length;
  journalEntryInput.setSelectionRange(pos, pos);
  hideMentionDropdown();
  journalEntryInput.focus();
}

postJournalEntry.addEventListener("click", submitJournalEntry);

if (cancelJournalEdit) {
  cancelJournalEdit.addEventListener("click", resetJournalComposer);
}

journalEntryInput.addEventListener("input", updateMentionDropdown);
journalEntryInput.addEventListener("keyup", (event) => {
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    updateMentionDropdown();
  }
});
journalEntryInput.addEventListener("blur", () => {
  // Delay so a click on a dropdown option still registers.
  setTimeout(hideMentionDropdown, 150);
});

if (mentionDropdown) {
  mentionDropdown.addEventListener("mousedown", (event) => {
    const option = event.target.closest("[data-mention-id]");
    if (!option) return;
    event.preventDefault();
    const story = getStoryById(option.dataset.mentionId);
    if (story) insertMention(story);
  });
}

journalTimeline.addEventListener("click", (event) => {
  const editBtn = event.target.closest("[data-journal-edit]");
  if (editBtn) {
    startEditJournal(editBtn.dataset.journalEdit);
    return;
  }
  const deleteBtn = event.target.closest("[data-journal-delete]");
  if (deleteBtn) {
    deleteJournal(deleteBtn.dataset.journalDelete);
    return;
  }
  const mention = event.target.closest("[data-story-open]");
  if (mention) {
    selectStory(mention.dataset.storyOpen, true);
  }
});

storyDisplay.classList.toggle("grid-view", state.activeView === "grid");
storyDisplay.classList.toggle("list-view", state.activeView === "list");
viewButtons.forEach((button) => {
  button.classList.toggle("active", button.dataset.view === state.activeView);
});

// ---------------------------------------------------------------------------
// Auth gate wiring
// ---------------------------------------------------------------------------
function initAuthGate() {
  const gate = document.getElementById("authGate");
  if (!gate) return;

  const tabs = gate.querySelectorAll("[data-auth-tab]");
  const panels = gate.querySelectorAll("[data-auth-panel]");
  const signInForm = document.getElementById("authSignInForm");
  const signUpForm = document.getElementById("authSignUpForm");
  const googleButtons = gate.querySelectorAll("[data-auth-google]");
  const forgotButton = document.getElementById("authForgotButton");
  const errorBox = document.getElementById("authError");

  const signInEmail = document.getElementById("authSignInEmail");
  const signInPassword = document.getElementById("authSignInPassword");
  const signUpName = document.getElementById("authSignUpName");
  const signUpEmail = document.getElementById("authSignUpEmail");
  const signUpPassword = document.getElementById("authSignUpPassword");
  const signUpConfirm = document.getElementById("authSignUpConfirm");

  function showError(message, ok = false) {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = !message;
    errorBox.classList.toggle("is-success", Boolean(ok && message));
  }

  function selectTab(name) {
    showError("");
    tabs.forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.authTab === name)
    );
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.authPanel !== name;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.authTab));
  });

  if (signInForm) {
    signInForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      showError("");
      try {
        await signInWithEmailAndPassword(
          auth,
          signInEmail.value.trim(),
          signInPassword.value
        );
      } catch (error) {
        showError(authErrorMessage(error));
      }
    });
  }

  if (signUpForm) {
    signUpForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      showError("");
      const password = signUpPassword.value;
      if (password.length < 6) {
        showError("Password must be at least 6 characters.");
        return;
      }
      if (password !== signUpConfirm.value) {
        showError("Passwords do not match.");
        return;
      }
      pendingSignupName = signUpName.value.trim();
      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          signUpEmail.value.trim(),
          password
        );
        if (pendingSignupName) {
          await updateProfile(credential.user, { displayName: pendingSignupName });
        }
      } catch (error) {
        pendingSignupName = "";
        showError(authErrorMessage(error));
      }
    });
  }

  const POPUP_FALLBACK_CODES = new Set([
    "auth/popup-blocked",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/operation-not-supported-in-this-environment",
    "auth/web-storage-unsupported"
  ]);

  googleButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      showError("");
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (error) {
        // Popups are often blocked inside embedded/sandboxed webviews — fall
        // back to a full-page redirect, which works in those environments.
        if (POPUP_FALLBACK_CODES.has(error && error.code)) {
          try {
            await signInWithRedirect(auth, googleProvider);
            return;
          } catch (redirectError) {
            showError(authErrorMessage(redirectError));
            return;
          }
        }
        showError(authErrorMessage(error));
      }
    });
  });

  // Complete any redirect-based Google sign-in that was started before a reload.
  getRedirectResult(auth).catch((error) => showError(authErrorMessage(error)));

  if (forgotButton) {
    forgotButton.addEventListener("click", async () => {
      const email = signInEmail.value.trim();
      if (!email) {
        showError("Enter your email above first, then tap reset.");
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        showError("Password reset email sent — check your inbox.", true);
      } catch (error) {
        showError(authErrorMessage(error));
      }
    });
  }

  selectTab("signin");
}

function showGate() {
  const gate = document.getElementById("authGate");
  if (gate) gate.hidden = false;
  document.body.classList.add("auth-locked");
}

function hideGate() {
  const gate = document.getElementById("authGate");
  if (gate) gate.hidden = true;
  document.body.classList.remove("auth-locked");
}

function renderAll() {
  storyDisplay.classList.toggle("grid-view", state.activeView === "grid");
  storyDisplay.classList.toggle("list-view", state.activeView === "list");
  viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  renderDashboardMetrics();
  renderGoalCard();
  renderRecentStories();
  renderStoryLibrary();
  renderWorkspace();
  renderAuthorPhoto();
  renderHeroBooks();
  renderProfile();
  renderSettings();
  renderJournal();
  updateSprintClock();
  openPage(state.activePage);
}

// Load the signed-in user's workspace from Firestore (seeding a fresh one for
// brand-new accounts), using the local cache first for an instant first paint.
async function loadUserState(user) {
  let cached = null;
  try {
    const raw = localStorage.getItem(`typemill-cache::${user.uid}`);
    if (raw) cached = JSON.parse(raw);
  } catch (error) {
    /* ignore bad cache */
  }
  if (cached) {
    state = hydrateState(cached);
    renderAll();
  }

  try {
    const snap = await getDoc(userDocRef(user.uid));
    if (snap.exists() && snap.data().state) {
      state = hydrateState(snap.data().state);
    } else {
      const seedName = user.displayName || pendingSignupName || "";
      state = buildNewAccountState(seedName, user.email || "");
      await setDoc(userDocRef(user.uid), {
        state: serializeState(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error("Unable to load workspace from Firestore", error);
    if (!cached) state = buildDefaultState();
  } finally {
    pendingSignupName = "";
  }

  try {
    localStorage.setItem(
      `typemill-cache::${user.uid}`,
      JSON.stringify(serializeState())
    );
  } catch (error) {
    /* best-effort */
  }
  renderAll();
}

initAuthGate();

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;
  if (!user) {
    showGate();
    return;
  }
  hideGate();
  await loadUserState(user);
});
