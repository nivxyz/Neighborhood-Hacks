// Every piece of text on screen, in English and Hindi.
// t("key") gives the text in the chosen language. Some entries are small functions,
// because the sentence changes with a number or name: t("openDays", 4) → "Open 4 days".
// To add a language, copy the `hi` block, translate it, and add it to LANGUAGES.

const plural = (n, one, many) => (Number(n) === 1 ? one : many);

const en = {
  // General
  logOut: "Log out",
  loading: "Loading…",
  cancel: "Cancel",
  backToBoard: "← Board",
  admin: "Admin",
  remove: "Remove",
  name: "Name",
  flat: "Flat",
  linkCopied: "Link copied",
  copyFailed: "Couldn't copy. Select the link and copy it yourself.",
  buildingGone: "That building doesn't exist any more",
  removedFromList: "You're no longer on this building's residents list",
  saveFailed: "Couldn't save. Check your internet and try again.",
  loadFailed: "Couldn't load FlatDesk:",

  // Time
  justNow: "just now",
  minsAgo: (n) => `${n}m ago`,
  hoursAgo: (n) => `${n}h ago`,
  daysAgo: (n) => `${n}d ago`,
  hours: (n) => `${n} ${plural(n, "hour", "hours")}`,
  days: (n) => `${n} ${plural(n, "day", "days")}`,
  openDays: (n) => `Open ${n} ${plural(n, "day", "days")}`,

  // Statuses and categories
  "status.reported": "Reported",
  "status.progress": "In progress",
  "status.resolved": "Resolved",
  "cat.Water": "Water",
  "cat.Electricity": "Electricity",
  "cat.Lift": "Lift",
  "cat.Plumbing": "Plumbing",
  "cat.Garbage": "Garbage",
  "cat.Security": "Security",
  "cat.Parking": "Parking",
  "cat.Other": "Other",

  // Landing page
  eyebrow: "For apartment buildings and housing societies",
  heroTitle: "Your building's complaints, in one place",
  heroText: `No more complaints lost in the WhatsApp group. Residents post problems, neighbours tap "Me too", and everyone can see when it's fixed.`,
  registerApartment: "Register your apartment",
  tryDemo: "Try the demo",
  haveCode: "Got a building code from your admin?",
  join: "Join",
  inviteOpensDirectly: "Invite links from WhatsApp open your building directly.",
  howItWorks: "How it works",
  step1Title: "Admin registers the building",
  step1Text: "The secretary or president uploads an Excel sheet of residents and their flat numbers.",
  step2Title: "Residents join from WhatsApp",
  step2Text: "They tap the invite link and enter their flat number and name. Only people on the list get in.",
  step3Title: "Every complaint gets tracked",
  step3Text: "Reported, in progress, resolved. Water and power cut notices stay pinned on top.",
  demoFailed: "Couldn't open the demo. Check your internet.",

  // Register
  buildingName: "Apartment or society name",
  buildingNameEg: "e.g. Green Park Residency",
  yourName: "Your name",
  yourFlat: "Your flat",
  flatEg: "e.g. A-101",
  adminPinNew: "Admin PIN (4 to 8 digits)",
  adminPinHint: "You'll use this to log in as admin. Don't share it.",
  residentsList: "Residents list",
  residentsListHint: "An Excel, CSV, LibreOffice or Numbers sheet with a <strong>Name</strong> column and a <strong>Flat</strong> column, one row per resident.",
  pasteInstead: "No sheet? Paste the list instead",
  pasteHint: "Copy it from WhatsApp, Notes, an email or a Word file. One resident per line, with their flat number:",
  pasteNoRows: "Couldn't find any flat numbers and names. Put one resident per line, like: A-101 Nivash",
  addPasted: "Add pasted names",
  sampleSheet: "Download a sample sheet",
  reading: (file) => `Reading ${file}…`,
  addListFirst: "Please add your residents list first.",
  createBuilding: "Create building",
  creating: "Creating…",
  createFailed: "Couldn't create the building",
  foundResidents: (n, flats) => `✓ Found ${n} ${plural(n, "resident", "residents")} in ${flats} ${plural(flats, "flat", "flats")}`,
  skippedRows: (n) => `(skipped ${n} ${plural(n, "row", "rows")} with no name or flat)`,
  andMore: (n) => `…and ${n} more`,
  sheetEmpty: "That sheet is empty.",
  needTwoCols: "The sheet needs two columns: name and flat number.",
  noRows: "Couldn't find any names and flat numbers in that sheet.",
  excelLoad: "Couldn't load the Excel reader. Check your internet.",
  sheetUnreadable: "Couldn't read that file. Is it an Excel or CSV sheet?",

  // After registering, invite
  isOnFlatDesk: (name) => `${name} is on FlatDesk`,
  sendLinkText: "Send this link to your building's WhatsApp group. Residents tap it and enter their flat number and name.",
  goToBoard: "Go to your building's board",
  buildingCode: "Building code",
  copy: "Copy",
  shareWhatsApp: "Share on WhatsApp",
  inviteMessage: (name, link) => `🏢 ${name} now uses FlatDesk for complaints and notices.\n\nJoin here: ${link}\nJust enter your flat number and name.`,

  // Join
  noBuilding: (code) => `No building with code ${code}`,
  checkCode: "Check the code or the link your admin sent.",
  backToStart: "Back to the start",
  joining: "Joining",
  joinText: "Enter your flat number and name as your building admin has them.",
  flatNumber: "Flat number",
  flatEg2: "e.g. B-304",
  iAmAdmin: "I'm the building admin",
  adminPin: "Admin PIN",
  continue: "Continue",
  demoNote: "This is the demo building: any name and flat works. The admin PIN is <strong>1234</strong>.",
  wrongPin: "Wrong admin PIN.",
  noFlat: (flat) => `Flat ${flat} isn't on this building's list. Check the number, or ask your admin to add you.`,
  noName: (flat) => `That name doesn't match anyone in flat ${flat}. Use the name your admin has on the list.`,
  welcome: (name) => `Welcome, ${name}`,

  // Board
  buildingBoard: "Community board",
  adminView: (building) => `Admin view: you're managing ${building}`,
  newComplaint: "+ New complaint",
  postAnnouncementBtn: "+ Post announcement",
  residentsAndInvite: "Residents and invite link",
  avgFixTime: "Avg. fix time",
  welcomeAdminTitle: "Your community board is ready",
  welcomeAdminText: "Three steps to get your building using it:",
  tipShare: "Share the invite link in your building's WhatsApp group.",
  tipAnnounce: "Post a first announcement, like the next water tank cleaning.",
  tipResidents: "Ask residents to post problems here instead of in the group.",
  shareInvite: "Share invite link",
  welcomeResidentTitle: (building) => `Welcome to ${building}`,
  welcomeResidentText: `Nothing's been posted yet. Got a problem in the building? Post it here, and neighbours with the same problem can tap "Me too".`,
  postFirst: "Post the first complaint",
  needsAttention: "Needs attention",
  needsAttentionHint: "Open 3+ days, or no update from you in 2+ days.",
  noUpdateFor: (n) => `No update for ${n} ${plural(n, "day", "days")}`,
  noAdminUpdate: "No admin update yet",
  announcements: "Announcements",
  noAnnouncements: "No announcements right now.",
  complaints: "Complaints",
  all: "All",
  nothingHere: "Nothing here. Lucky building!",
  announcementRemoved: "Announcement removed",
  othersAffected: (n) => `${n} ${plural(n, "other", "others")} affected`,
  hasPhoto: "Has a photo",

  // Residents page
  residents: "Residents",
  inviteLink: "Invite link",
  demoAnyone: "Demo building: anyone can join",
  peopleOnList: (n) => `${n} ${plural(n, "person", "people")} on the list`,
  addResident: "Add a resident",
  add: "Add",
  addFromSheet: "Or add everyone from a file:",
  added: (n) => `Added ${n} ${plural(n, "resident", "residents")}`,
  alreadyOnList: "Already on the list",
  removedResident: (name) => `Removed ${name}`,
  confirmRemove: (name, flat) => `Remove ${name} (${flat}) from the list? They won't be able to use FlatDesk any more.`,
  searchResidents: "Search by name or flat",

  // New complaint
  newComplaintTitle: "New complaint",
  whatProblem: "What's the problem?",
  problemEg: "e.g. No water in C block since morning",
  category: "Category",
  details: "Details (optional)",
  detailsEg: "Where exactly, since when, anything else the admin should know",
  photo: "Photo (optional)",
  addPhoto: "Add a photo",
  removePhoto: "Remove photo",
  preparingPhoto: "Preparing photo…",
  photoFailed: "Couldn't read that photo. Try a JPG or PNG.",
  photoAlt: "Photo of the problem",
  postComplaint: "Post complaint",
  complaintPosted: "Complaint posted",
  similarHead: "Is it one of these? Tap <strong>Me too</strong> instead of posting it again.",
  flatsAffected: (n) => `${n} ${plural(n, "flat", "flats")} affected`,
  meToo: "Me too",
  addedToComplaint: "Added you to this complaint",

  // One complaint
  byAuthor: (name, flat) => `by ${name}, ${flat}`,
  youHaveThis: "✓ You have this too",
  othersHaveIt: (n) => `${n} other ${plural(n, "flat has", "flats have")} the same problem.`,
  updates: "Updates",
  adminPostUpdate: "Admin: post an update",
  status: "Status",
  noteForResidents: "Note for residents",
  noteEg: "e.g. Plumber coming at 4 PM today",
  postUpdate: "Post update",
  markedResolved: "Marked as resolved",
  updatePosted: "Update posted",
  complaintGone: "That complaint doesn't exist any more.",
  backToBoardLink: "Back to the board",
  shareComplaint: (title, status, n, link) => `🚨 ${title}\n${status} · ${n} ${plural(n, "flat", "flats")} affected\n\nSame problem? Tap "Me too" here: ${link}`,
  shareAnnouncementMore: "More on FlatDesk:",
  close: "Close",

  // New announcement
  postAnnouncement: "Post announcement",
  title: "Title",
  titleEg: "e.g. Power cut for transformer repair",
  when: "When (optional)",
  whenEg: "e.g. Tuesday, 2 PM to 5 PM",
  announcementPosted: "Announcement posted",
};

const hi = {
  // General
  logOut: "लॉग आउट",
  loading: "लोड हो रहा है…",
  cancel: "रद्द करें",
  backToBoard: "← बोर्ड",
  admin: "एडमिन",
  remove: "हटाएं",
  name: "नाम",
  flat: "फ्लैट",
  linkCopied: "लिंक कॉपी हो गया",
  copyFailed: "कॉपी नहीं हो पाया। लिंक चुनकर खुद कॉपी करें।",
  buildingGone: "यह बिल्डिंग अब मौजूद नहीं है",
  removedFromList: "अब आप इस बिल्डिंग की निवासी सूची में नहीं हैं",
  saveFailed: "सेव नहीं हो पाया। इंटरनेट जांचें और फिर कोशिश करें।",
  loadFailed: "FlatDesk लोड नहीं हो पाया:",

  // Time
  justNow: "अभी-अभी",
  minsAgo: (n) => `${n} मिनट पहले`,
  hoursAgo: (n) => `${n} घंटे पहले`,
  daysAgo: (n) => `${n} दिन पहले`,
  hours: (n) => `${n} घंटे`,
  days: (n) => `${n} दिन`,
  openDays: (n) => `${n} दिन से खुली`,

  // Statuses and categories
  "status.reported": "दर्ज",
  "status.progress": "काम जारी",
  "status.resolved": "हल हो गई",
  "cat.Water": "पानी",
  "cat.Electricity": "बिजली",
  "cat.Lift": "लिफ्ट",
  "cat.Plumbing": "प्लंबिंग",
  "cat.Garbage": "कचरा",
  "cat.Security": "सुरक्षा",
  "cat.Parking": "पार्किंग",
  "cat.Other": "अन्य",

  // Landing page
  eyebrow: "अपार्टमेंट और हाउसिंग सोसाइटी के लिए",
  heroTitle: "आपकी बिल्डिंग की सारी शिकायतें, एक जगह",
  heroText: `अब WhatsApp ग्रुप में शिकायतें नहीं खोएंगी। निवासी समस्या दर्ज करते हैं, पड़ोसी "मेरी भी" दबाते हैं, और सबको दिखता है कि काम कब पूरा हुआ।`,
  registerApartment: "अपनी बिल्डिंग रजिस्टर करें",
  tryDemo: "डेमो देखें",
  haveCode: "क्या एडमिन ने आपको बिल्डिंग कोड दिया है?",
  join: "जुड़ें",
  inviteOpensDirectly: "WhatsApp पर आया इनवाइट लिंक सीधे आपकी बिल्डिंग खोलता है।",
  howItWorks: "यह कैसे काम करता है",
  step1Title: "एडमिन बिल्डिंग रजिस्टर करते हैं",
  step1Text: "सेक्रेटरी या प्रेसिडेंट निवासियों और उनके फ्लैट नंबरों की Excel शीट अपलोड करते हैं।",
  step2Title: "निवासी WhatsApp से जुड़ते हैं",
  step2Text: "वे इनवाइट लिंक दबाकर अपना फ्लैट नंबर और नाम डालते हैं। सिर्फ़ सूची वाले लोग ही जुड़ पाते हैं।",
  step3Title: "हर शिकायत पर नज़र रहती है",
  step3Text: "दर्ज, काम जारी, हल हो गई। पानी और बिजली कटौती की सूचनाएं सबसे ऊपर रहती हैं।",
  demoFailed: "डेमो नहीं खुल पाया। इंटरनेट जांचें।",

  // Register
  buildingName: "अपार्टमेंट या सोसाइटी का नाम",
  buildingNameEg: "जैसे Green Park Residency",
  yourName: "आपका नाम",
  yourFlat: "आपका फ्लैट",
  flatEg: "जैसे A-101",
  adminPinNew: "एडमिन PIN (4 से 8 अंक)",
  adminPinHint: "एडमिन के रूप में लॉग इन करने के लिए इसका इस्तेमाल होगा। इसे किसी को न बताएं।",
  residentsList: "निवासियों की सूची",
  residentsListHint: "Excel, CSV, LibreOffice या Numbers शीट, जिसमें <strong>Name</strong> और <strong>Flat</strong> कॉलम हों, हर निवासी की एक पंक्ति।",
  pasteInstead: "शीट नहीं है? सूची पेस्ट करें",
  pasteHint: "WhatsApp, Notes, ईमेल या Word फ़ाइल से कॉपी करें। हर लाइन में एक निवासी, फ्लैट नंबर के साथ:",
  pasteNoRows: "कोई फ्लैट नंबर और नाम नहीं मिला। हर लाइन में एक निवासी लिखें, जैसे: A-101 Nivash",
  addPasted: "पेस्ट किए नाम जोड़ें",
  sampleSheet: "नमूना शीट डाउनलोड करें",
  reading: (file) => `${file} पढ़ी जा रही है…`,
  addListFirst: "पहले निवासियों की सूची जोड़ें।",
  createBuilding: "बिल्डिंग बनाएं",
  creating: "बन रही है…",
  createFailed: "बिल्डिंग नहीं बन पाई",
  foundResidents: (n, flats) => `✓ ${flats} फ्लैट में ${n} निवासी मिले`,
  skippedRows: (n) => `(बिना नाम या फ्लैट वाली ${n} पंक्तियां छोड़ दी गईं)`,
  andMore: (n) => `…और ${n}`,
  sheetEmpty: "यह शीट खाली है।",
  needTwoCols: "शीट में दो कॉलम चाहिए: नाम और फ्लैट नंबर।",
  noRows: "इस शीट में कोई नाम और फ्लैट नंबर नहीं मिला।",
  excelLoad: "Excel रीडर लोड नहीं हो पाया। इंटरनेट जांचें।",
  sheetUnreadable: "यह फ़ाइल नहीं पढ़ी जा सकी। क्या यह Excel या CSV शीट है?",

  // After registering, invite
  isOnFlatDesk: (name) => `${name} अब FlatDesk पर है`,
  sendLinkText: "यह लिंक अपनी बिल्डिंग के WhatsApp ग्रुप में भेजें। निवासी इसे दबाकर अपना फ्लैट नंबर और नाम डालेंगे।",
  goToBoard: "अपनी बिल्डिंग का बोर्ड खोलें",
  buildingCode: "बिल्डिंग कोड",
  copy: "कॉपी करें",
  shareWhatsApp: "WhatsApp पर भेजें",
  inviteMessage: (name, link) => `🏢 ${name} अब शिकायतों और सूचनाओं के लिए FlatDesk इस्तेमाल करती है।\n\nयहां जुड़ें: ${link}\nबस अपना फ्लैट नंबर और नाम डालें।`,

  // Join
  noBuilding: (code) => `${code} कोड वाली कोई बिल्डिंग नहीं मिली`,
  checkCode: "कोड या एडमिन का भेजा लिंक जांचें।",
  backToStart: "शुरुआत पर वापस जाएं",
  joining: "जुड़ रहे हैं",
  joinText: "अपना फ्लैट नंबर और नाम वैसे ही डालें जैसे एडमिन की सूची में है।",
  flatNumber: "फ्लैट नंबर",
  flatEg2: "जैसे B-304",
  iAmAdmin: "मैं बिल्डिंग का एडमिन हूं",
  adminPin: "एडमिन PIN",
  continue: "आगे बढ़ें",
  demoNote: "यह डेमो बिल्डिंग है: कोई भी नाम और फ्लैट चलेगा। एडमिन PIN <strong>1234</strong> है।",
  wrongPin: "गलत एडमिन PIN।",
  noFlat: (flat) => `फ्लैट ${flat} इस बिल्डिंग की सूची में नहीं है। नंबर जांचें, या एडमिन से आपको जोड़ने को कहें।`,
  noName: (flat) => `यह नाम फ्लैट ${flat} में किसी से मेल नहीं खाता। वही नाम डालें जो एडमिन की सूची में है।`,
  welcome: (name) => `स्वागत है, ${name}`,

  // Board
  buildingBoard: "कम्युनिटी बोर्ड",
  adminView: (building) => `एडमिन व्यू: आप ${building} संभाल रहे हैं`,
  newComplaint: "+ नई शिकायत",
  postAnnouncementBtn: "+ सूचना डालें",
  residentsAndInvite: "निवासी और इनवाइट लिंक",
  avgFixTime: "औसत सुधार समय",
  welcomeAdminTitle: "आपका कम्युनिटी बोर्ड तैयार है",
  welcomeAdminText: "बिल्डिंग में इसे शुरू करने के तीन कदम:",
  tipShare: "बिल्डिंग के WhatsApp ग्रुप में इनवाइट लिंक भेजें।",
  tipAnnounce: "पहली सूचना डालें, जैसे अगली पानी की टंकी की सफ़ाई।",
  tipResidents: "निवासियों से कहें कि समस्याएं ग्रुप की बजाय यहां डालें।",
  shareInvite: "इनवाइट लिंक भेजें",
  welcomeResidentTitle: (building) => `${building} में आपका स्वागत है`,
  welcomeResidentText: `अभी तक कुछ नहीं डाला गया है। बिल्डिंग में कोई समस्या है? यहां डालें, और जिन पड़ोसियों की भी यही समस्या है वे "मेरी भी" दबा सकते हैं।`,
  postFirst: "पहली शिकायत दर्ज करें",
  needsAttention: "ध्यान देने की ज़रूरत",
  needsAttentionHint: "3+ दिन से खुली, या 2+ दिन से आपका कोई अपडेट नहीं।",
  noUpdateFor: (n) => `${n} दिन से कोई अपडेट नहीं`,
  noAdminUpdate: "अभी तक एडमिन का कोई अपडेट नहीं",
  announcements: "सूचनाएं",
  noAnnouncements: "अभी कोई सूचना नहीं है।",
  complaints: "शिकायतें",
  all: "सभी",
  nothingHere: "यहां कुछ नहीं है। किस्मत वाली बिल्डिंग!",
  announcementRemoved: "सूचना हटा दी गई",
  othersAffected: (n) => `${n} और फ्लैट प्रभावित`,
  hasPhoto: "फोटो है",

  // Residents page
  residents: "निवासी",
  inviteLink: "इनवाइट लिंक",
  demoAnyone: "डेमो बिल्डिंग: कोई भी जुड़ सकता है",
  peopleOnList: (n) => `सूची में ${n} लोग`,
  addResident: "निवासी जोड़ें",
  add: "जोड़ें",
  addFromSheet: "या किसी फ़ाइल से सबको जोड़ें:",
  added: (n) => `${n} निवासी जोड़े गए`,
  alreadyOnList: "पहले से सूची में है",
  removedResident: (name) => `${name} को हटा दिया गया`,
  confirmRemove: (name, flat) => `${name} (${flat}) को सूची से हटाएं? वे अब FlatDesk इस्तेमाल नहीं कर पाएंगे।`,
  searchResidents: "नाम या फ्लैट से खोजें",

  // New complaint
  newComplaintTitle: "नई शिकायत",
  whatProblem: "समस्या क्या है?",
  problemEg: "जैसे C ब्लॉक में सुबह से पानी नहीं",
  category: "श्रेणी",
  details: "विवरण (वैकल्पिक)",
  detailsEg: "ठीक कहां, कब से, और एडमिन को जो कुछ जानना चाहिए",
  photo: "फोटो (वैकल्पिक)",
  addPhoto: "फोटो जोड़ें",
  removePhoto: "फोटो हटाएं",
  preparingPhoto: "फोटो तैयार हो रही है…",
  photoFailed: "यह फोटो नहीं पढ़ी जा सकी। JPG या PNG आज़माएं।",
  photoAlt: "समस्या की फोटो",
  postComplaint: "शिकायत दर्ज करें",
  complaintPosted: "शिकायत दर्ज हो गई",
  similarHead: "क्या यह इनमें से कोई है? दोबारा दर्ज करने के बजाय <strong>मेरी भी</strong> दबाएं।",
  flatsAffected: (n) => `${n} फ्लैट प्रभावित`,
  meToo: "मेरी भी",
  addedToComplaint: "आपको इस शिकायत में जोड़ दिया गया",

  // One complaint
  byAuthor: (name, flat) => `${name}, ${flat} द्वारा`,
  youHaveThis: "✓ आपकी भी यही समस्या है",
  othersHaveIt: (n) => `${n} और फ्लैट में यही समस्या है।`,
  updates: "अपडेट",
  adminPostUpdate: "एडमिन: अपडेट डालें",
  status: "स्थिति",
  noteForResidents: "निवासियों के लिए नोट",
  noteEg: "जैसे प्लंबर आज शाम 4 बजे आएगा",
  postUpdate: "अपडेट डालें",
  markedResolved: "हल के रूप में चिह्नित",
  updatePosted: "अपडेट डाल दिया गया",
  complaintGone: "यह शिकायत अब मौजूद नहीं है।",
  backToBoardLink: "बोर्ड पर वापस जाएं",
  shareComplaint: (title, status, n, link) => `🚨 ${title}\n${status} · ${n} फ्लैट प्रभावित\n\nयही समस्या है? यहां "मेरी भी" दबाएं: ${link}`,
  shareAnnouncementMore: "FlatDesk पर और देखें:",
  close: "बंद करें",

  // New announcement
  postAnnouncement: "सूचना डालें",
  title: "शीर्षक",
  titleEg: "जैसे ट्रांसफॉर्मर की मरम्मत के लिए बिजली कटौती",
  when: "कब (वैकल्पिक)",
  whenEg: "जैसे मंगलवार, दोपहर 2 से 5 बजे",
  announcementPosted: "सूचना डाल दी गई",
};

// The button in the top bar shows the language you can switch TO
export const LANGUAGES = {
  en: { strings: en, switchLabel: "हिंदी", next: "hi" },
  hi: { strings: hi, switchLabel: "English", next: "en" },
};

const LANG_KEY = "flatdesk-lang";
let lang = "en";
try {
  if (LANGUAGES[localStorage.getItem(LANG_KEY)]) lang = localStorage.getItem(LANG_KEY);
} catch (e) {}
document.documentElement.lang = lang;

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch (e) {}
}

export function has(key) {
  return key in en;
}

export function t(key, ...args) {
  const value = LANGUAGES[lang].strings[key] ?? en[key] ?? key;
  return typeof value === "function" ? value(...args) : value;
}
