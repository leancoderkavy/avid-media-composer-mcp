import type { FaqItem } from "./faq"

export type GuideSection = {
  h2: string
  body?: string[]
  list?: string[]
  table?: { head: string[]; rows: string[][] }
}

export type Guide = {
  slug: string
  /** Page <title>. Written around the primary keyword. */
  metaTitle: string
  /** Short label used in navigation, breadcrumbs and internal links. */
  navLabel: string
  h1: string
  /** Italicised tail of the H1. */
  h1Accent: string
  eyebrow: string
  description: string
  primaryKeyword: string
  keywords: string[]
  /**
   * Answer-first paragraph. AI answer engines quote the first passage under an H1,
   * so this states the definition in one self-contained block with no anaphora.
   */
  answer: string
  sections: GuideSection[]
  faq: FaqItem[]
  /** MCP tools that act on this subject, linked back to the tool reference. */
  tools: string[]
}

export const guides: Guide[] = [
  {
    slug: "avb-file",
    metaTitle: "What Is an AVB File? Avid Bin Format Explained",
    navLabel: "AVB files",
    h1: "AVB files: the Avid",
    h1Accent: "bin format.",
    eyebrow: "Format guide",
    description:
      "An AVB file is an Avid Media Composer bin: a proprietary binary container holding clips, subclips, sequences and metadata. How the format is structured, how to open one, and how to read a .avb without Media Composer.",
    primaryKeyword: "AVB file",
    keywords: ["avb file", "avb file format", "avb file extension", "how to open avb file", "avid avb file", "avb file converter", "avid bin file"],
    answer:
      "An AVB file is an Avid Media Composer bin. The `.avb` extension marks a proprietary binary container that stores the clips, subclips, sequences, groups, effects, bin views and column metadata belonging to one bin inside an Avid project folder. AVB is not an interchange format and is not media: it holds references to media files rather than the picture and sound themselves, and Avid publishes no public specification for it. Media Composer opens AVB files natively; outside Media Composer they can be read with the open-source `pyavb` library, which is what the Avid Media Composer MCP server uses for offline bin analysis.",
    sections: [
      {
        h2: "What is inside an AVB file?",
        body: [
          "An Avid bin is an object graph, not a flat table. Media Composer serialises the bin's objects — the same mobs, tracks and components model that AAF later standardised — into a single binary file. Reading one means walking that graph rather than parsing lines.",
          "A typical bin contains the following object families."
        ],
        list: [
          "Master mobs: the clips shown in the bin, each pointing at source material by identifier rather than by path.",
          "Source mobs: the tape, file or import sources those clips were logged from, carrying reel names, timecode and file descriptors.",
          "Composition mobs: sequences and subclips, with video and audio tracks made of source clips, filler, transitions and effects.",
          "Bin presentation state: column layouts, sift and sort settings, custom columns, frame or script view state and clip colours.",
          "User metadata: comments, markers, and any column values entered by the assistant or editor."
        ]
      },
      {
        h2: "AVB vs AAF vs MXF: which file does what",
        body: [
          "These extensions appear side by side in an Avid workflow and are routinely confused. They occupy different layers."
        ],
        table: {
          head: ["Extension", "Layer", "Portable?", "Contains media?"],
          rows: [
            ["`.avb`", "Avid bin, project-internal", "No — Avid only", "No, references only"],
            ["`.aaf`", "Interchange composition or embedded essence", "Yes — open AMWA standard", "Optionally, when embedded"],
            ["`.mxf`", "Media essence container", "Yes — SMPTE standard", "Yes, the picture or sound itself"],
            ["`.ale`", "Tab-delimited metadata log", "Yes — plain text", "No"],
            ["`.edl`", "CMX-style cut list", "Yes — plain text", "No"]
          ]
        }
      },
      {
        h2: "How to open an AVB file",
        body: [
          "There is no general-purpose AVB converter, because there is no published specification to convert from. Three approaches are practical."
        ],
        list: [
          "Media Composer: open the containing project and the bin, then export the parts you need as AAF, ALE or EDL. This is the only path that is fully faithful.",
          "`pyavb`: an open-source Python reader for Avid bins. It exposes the object graph directly and is the basis for most non-Avid AVB tooling.",
          "An MCP server: `avid_analyze_bin` in the Avid Media Composer MCP wraps `pyavb` and returns mobs, tracks, clips, sequences, views and metadata as structured JSON that an AI client can reason over, without opening Media Composer and without modifying the bin."
        ]
      },
      {
        h2: "Reading a bin safely",
        body: [
          "Bins are live project state. An assistant editor's working bin can be open in Media Composer, locked by another user on shared storage, or mid-save. Any offline reader has to respect that.",
          "The MCP server treats a bin as read-only and never writes to `.avb` files. It also reports the neighbouring `.lck` [bin locks](/bin-locking/) it finds, so an automated audit can distinguish a bin that is genuinely in use from one holding an orphaned lock left by a crash. When `pyavb` cannot decode a structure, the result is labelled as opaque evidence rather than guessed at."
        ]
      }
    ],
    faq: [
      {
        question: "What is an AVB file?",
        answer:
          "An AVB file is an Avid Media Composer bin — a proprietary binary container storing clips, subclips, sequences, effects and bin metadata for one bin in an Avid project. It references media rather than containing it."
      },
      {
        question: "How do I open an AVB file without Media Composer?",
        answer:
          "Use the open-source pyavb Python library, or a tool built on it such as the avid_analyze_bin tool in the Avid Media Composer MCP server, which returns the bin's mobs, tracks, clips and metadata as structured JSON."
      },
      {
        question: "Is there an AVB to AAF converter?",
        answer:
          "There is no reliable standalone converter. The supported route is to open the bin in Media Composer and export the sequence or clips as AAF. pyavb can read a bin's structure programmatically, but faithfully rewriting it as AAF is a separate translation problem."
      },
      {
        question: "What is the difference between an AVB file and an MXF file?",
        answer:
          "An AVB file is an Avid bin holding editorial metadata and references. An MXF file is a media container holding the actual picture or sound essence. Deleting a bin loses editorial work; deleting MXF media loses the footage."
      }
    ],
    tools: ["avid_analyze_bin", "avid_inventory_project_files", "avid_analyze_project"]
  },
  {
    slug: "aaf-file",
    metaTitle: "What Is an AAF File? Structure, Contents and How to Inspect One",
    navLabel: "AAF files",
    h1: "AAF files:",
    h1Accent: "structure and contents.",
    eyebrow: "Format guide",
    description:
      "An AAF file is an Advanced Authoring Format package carrying an edited composition and its metadata between Avid, Pro Tools, Premiere Pro and Resolve. What an AAF contains, how it differs from OMF, and how to inspect one before conform.",
    primaryKeyword: "AAF file",
    keywords: ["what is an aaf file", "aaf file format", "aaf file structure", "what does an aaf file contain", "aaf vs omf file", "aaf file how to open", "aaf file avid", "aaf project file"],
    answer:
      "An AAF file is an Advanced Authoring Format package: an open interchange format, standardised by the Advanced Media Workflow Association, that carries an edited composition and its metadata between applications such as Avid Media Composer, Pro Tools, Adobe Premiere Pro and DaVinci Resolve. An AAF stores the edit — tracks, clips, timecode, transitions, effect parameters and source references — as a graph of mobs and slots inside a structured-storage container. It can either link to external media (a link AAF) or embed the essence itself (an embedded AAF), which is why AAF file sizes range from kilobytes to many gigabytes.",
    sections: [
      {
        h2: "What does an AAF file contain?",
        body: [
          "AAF describes an edit as a hierarchy of mobs. Each mob is an object with a unique MobID, and mobs reference each other rather than duplicating data."
        ],
        list: [
          "Composition mobs: the sequence itself. Each holds timeline slots for video and audio, and each slot holds components in order — source clips, filler, transitions and effects.",
          "Master mobs: the logical clips the composition points at, one per piece of material.",
          "Source mobs: the physical origin of that material, carrying the essence descriptor — codec, frame rate, raster, audio sample rate and channel count — plus reel name and start timecode.",
          "Essence data: present only in an embedded AAF. A link AAF omits it and relies on the destination application relinking to media on disk.",
          "Operation groups and parameters: effects and their keyframed values, which survive interchange only when both applications understand the same effect definitions."
        ]
      },
      {
        h2: "AAF vs OMF",
        body: [
          "OMF (Open Media Framework) is AAF's predecessor and still appears in audio handoffs. AAF superseded it for good reasons."
        ],
        table: {
          head: ["", "AAF", "OMF"],
          rows: [
            ["Status", "Current AMWA standard", "Legacy, effectively frozen"],
            ["File size ceiling", "No 2 GB limit", "2 GB per file"],
            ["Video handling", "Video and audio", "Audio in practice"],
            ["Metadata depth", "Rich: effects, descriptors, extensible", "Limited"],
            ["Typical use today", "Picture and sound turnover", "Older Pro Tools round trips"]
          ]
        }
      },
      {
        h2: "Why AAF conforms fail",
        body: [
          "Most failed conforms come from a small set of causes, and all of them are visible in the file before anyone opens it in the destination application."
        ],
        list: [
          "Missing media: a link AAF whose source mobs point at essence that was never delivered alongside it.",
          "Rate mismatch: an edit rate or audio sample rate that the destination timeline does not share, which silently shifts sync.",
          "Unsupported effects: operation groups the destination cannot interpret, which arrive flattened, ignored or as offline gaps.",
          "Truncated or malformed structure: a package cut short in transfer, which some applications open partially rather than rejecting.",
          "Reel and timecode gaps: source mobs missing the reel names or start timecode a conform depends on."
        ]
      },
      {
        h2: "How to inspect an AAF before you conform",
        body: [
          "Opening the AAF in the destination NLE is the slowest way to find a problem with it. Reading the structure directly is faster and is safe to automate.",
          "`pyaaf2` is a pure-Python implementation of the format that parses an AAF without Avid or Pro Tools installed. The Avid Media Composer MCP server's `avid_analyze_aaf` tool wraps it and returns mobs, slots, components, essence descriptors and detected structural risks as JSON, so an AI client can answer whether a package will conform from the file itself. The read is offline and never modifies the package."
        ]
      }
    ],
    faq: [
      {
        question: "What is an AAF file?",
        answer:
          "An AAF file is an Advanced Authoring Format package: an open interchange format that carries an edited composition — tracks, clips, timecode, transitions and effect metadata — between Avid Media Composer, Pro Tools, Premiere Pro, Resolve and other applications."
      },
      {
        question: "What does an AAF file contain?",
        answer:
          "A graph of mobs: composition mobs holding the sequence's tracks and components, master mobs for each logical clip, and source mobs carrying essence descriptors, reel names and timecode. An embedded AAF also contains the media essence; a link AAF does not."
      },
      {
        question: "What is the difference between AAF and OMF?",
        answer:
          "AAF is the current AMWA standard with no 2 GB file size limit, full video support and rich effect metadata. OMF is its legacy predecessor, capped at 2 GB per file and used mainly for older Pro Tools audio round trips."
      },
      {
        question: "How do I open an AAF file to check it?",
        answer:
          "For structural inspection rather than editing, use the open-source pyaaf2 library, or the avid_analyze_aaf tool in the Avid Media Composer MCP server, which reports mobs, slots, components, descriptors and conform risks without opening an NLE."
      },
      {
        question: "Why is my AAF file so large?",
        answer:
          "Because it is an embedded AAF: the media essence is stored inside the package rather than linked externally. A link AAF describing the same sequence is usually only kilobytes."
      }
    ],
    tools: ["avid_analyze_aaf", "avid_preview_otio_handoff", "avid_analyze_project"]
  },
  {
    slug: "ale-file",
    metaTitle: "ALE Files: The Avid Log Exchange Format Explained",
    navLabel: "ALE files",
    h1: "ALE:",
    h1Accent: "Avid Log Exchange.",
    eyebrow: "Format guide",
    description:
      "An ALE file is a tab-delimited Avid Log Exchange metadata log. The Heading, Column and Data sections, the headings that matter, how to export and import ALE in Media Composer, and how to validate one before it breaks a batch import.",
    primaryKeyword: "ALE file",
    keywords: ["ale file", "avid ale file", "ale avid log exchange", "avid export ale", "import ale avid media composer", "ale file format", "avid log exchange format"],
    answer:
      "An ALE file is an Avid Log Exchange log: a plain-text, tab-delimited file that carries clip metadata — reel names, timecode, camera and lens data, scene and take, colour-decision references and any custom column — into Avid Media Composer bins. ALE carries no media and no edit; it is a column-and-row table with a small header. Its structure is three labelled sections in fixed order: `Heading`, `Column` and `Data`. Because it is plain text, an ALE can be generated by a DIT, a camera-report tool or a script, and imported into a bin without opening any other application.",
    sections: [
      {
        h2: "ALE file structure",
        body: [
          "Every valid ALE has the same three sections, each introduced by its own line."
        ],
        list: [
          "`Heading`: global key/value lines describing the log itself. `FIELD_DELIM` must be `TABS`; `VIDEO_FORMAT`, `AUDIO_FORMAT`, `FPS` and `TAPE` are the headings Media Composer most commonly reads.",
          "`Column`: a single tab-delimited line naming every column, in the order the data rows use. `Name`, `Tape`, `Start`, `End` and `Tracks` are conventional; any additional column becomes a custom bin column.",
          "`Data`: one tab-delimited row per clip, with fields positionally matched to the `Column` line."
        ]
      },
      {
        h2: "What breaks an ALE import",
        body: [
          "ALE failures are almost always structural rather than semantic, and they are cheap to catch before import."
        ],
        list: [
          "A missing `Column` section, which leaves the rows with nothing to bind to.",
          "A `FIELD_DELIM` that is not `TABS`. Comma and space delimited variants exist in the wild and are not fully supported.",
          "Rows whose field count does not match the column count, usually because a value contained a stray tab or a line break.",
          "A missing `FPS` or `VIDEO_FORMAT` heading, which leaves timecode interpretation ambiguous.",
          "Encoding drift — a file saved as UTF-16, or with line endings a downstream tool does not expect."
        ]
      },
      {
        h2: "Exporting and importing ALE in Media Composer",
        body: [
          "To export: select the clips in a bin, choose File > Output > Export to File, and pick the Avid Log Exchange (ALE) export setting. The bin's visible columns determine what is written, so set the bin view before exporting.",
          "To import: with the target bin active, choose File > Input > Import Media, or drag the `.ale` onto the bin. Media Composer creates one clip per data row and maps each column onto a bin column, creating custom columns where names do not match built-in ones.",
          "Merging metadata onto existing clips rather than creating new ones is a separate operation. Media Composer's Merge Events behaviour matches on a key column such as `Name` or `Tape`, which is why consistent key values matter more than any other field in the log."
        ]
      },
      {
        h2: "Validating an ALE automatically",
        body: [
          "`avid_analyze_ale` in the Avid Media Composer MCP server parses the headings, the column line and every data row with a native parser — no Media Composer and no Python dependency — and returns the parsed structure plus warnings for the failure modes above. It reads the file and never rewrites it, so it is safe to point at a delivery folder before anyone imports anything."
        ]
      }
    ],
    faq: [
      {
        question: "What is an ALE file?",
        answer:
          "An ALE file is an Avid Log Exchange log: a tab-delimited plain-text file carrying clip metadata such as reel, timecode, scene, take and custom columns into Avid Media Composer bins. It contains no media and no edit."
      },
      {
        question: "What are the sections of an ALE file?",
        answer:
          "Three, in order: Heading with global key/value pairs such as FIELD_DELIM, VIDEO_FORMAT and FPS; Column with a single tab-delimited list of column names; and Data with one tab-delimited row per clip."
      },
      {
        question: "How do I import an ALE into Avid Media Composer?",
        answer:
          "Activate the target bin and use File > Input > Import Media, or drag the .ale file onto the bin. Media Composer creates one clip per data row and maps the ALE columns onto bin columns."
      },
      {
        question: "Why did my ALE import fail?",
        answer:
          "Most often a missing Column section, a FIELD_DELIM other than TABS, or data rows whose field count does not match the column line because a value contained a stray tab or line break."
      }
    ],
    tools: ["avid_analyze_ale", "avid_inventory_project_files"]
  },
  {
    slug: "edl-file",
    metaTitle: "EDL Files in Avid Media Composer: CMX Format Explained",
    navLabel: "EDL files",
    h1: "EDL files:",
    h1Accent: "the CMX cut list.",
    eyebrow: "Format guide",
    description:
      "An EDL is a plain-text CMX-style edit decision list. How to read an EDL event line, what the transition codes and comment lines mean, how to export one from Avid, and how to validate an EDL before a conform.",
    primaryKeyword: "EDL file",
    keywords: ["edl file", "avid edl format", "edl example", "create edl avid", "edl avid media composer", "avid edl manager", "export edl avid", "cmx 3600 edl"],
    answer:
      "An EDL is an edit decision list: a plain-text file, almost always in the CMX 3600 dialect, that describes a cut as a numbered sequence of events. Each event names a source reel, a track type, a transition, and four timecodes — source in, source out, record in and record out. An EDL carries no media, no effects beyond simple transitions, and only one video track, which is why it survives as a conform and colour-grading handoff format rather than a general interchange format. Avid Media Composer exports EDLs through EDL Manager or the List Tool, and any text editor can open one.",
    sections: [
      {
        h2: "How to read an EDL event",
        body: [
          "A CMX 3600 event line is fixed-width and positional. A typical line reads:",
          "`003  TAPE01   V     C        01:00:12:00 01:00:15:10 00:00:06:00 00:00:09:10`",
          "Read left to right, the fields are the event number, the source reel identifier, the track type, the transition code, and then source in, source out, record in and record out timecodes."
        ],
        table: {
          head: ["Field", "Example", "Meaning"],
          rows: [
            ["Event number", "`003`", "Sequential edit number, three digits"],
            ["Reel", "`TAPE01`", "Source identifier, historically eight characters"],
            ["Track", "`V`, `A1`, `A2`, `AA`", "Video, audio channel, or both audio channels"],
            ["Transition", "`C`, `D`, `W###`, `K`", "Cut, dissolve, wipe with pattern number, key"],
            ["Duration", "`025`", "Transition length in frames, present only for non-cuts"],
            ["Timecodes", "four HH:MM:SS:FF values", "Source in, source out, record in, record out"]
          ]
        }
      },
      {
        h2: "Comment and note lines",
        body: [
          "Everything that CMX 3600 cannot express in an event line arrives as a comment. These lines are not decoration — a conform frequently depends on them."
        ],
        list: [
          "`* FROM CLIP NAME:` and `* TO CLIP NAME:` carry the human-readable clip names either side of a transition.",
          "`* SOURCE FILE:` carries a file name for file-based sources, which matters when reel identifiers are not unique.",
          "`M2` motion effect lines carry a source speed for a retimed event, adjacent to the event they modify.",
          "`FCM: NON-DROP FRAME` or `FCM: DROP FRAME` sets the frame count mode for the timecodes that follow. Getting this wrong shifts every subsequent record timecode.",
          "`TITLE:` on the first line names the list."
        ]
      },
      {
        h2: "Exporting an EDL from Avid Media Composer",
        body: [
          "Load the sequence in the Timeline, then open EDL Manager — on recent releases the List Tool serves the same role. Choose the CMX 3600 template, set the frame count mode to match the sequence, and select which tracks to output.",
          "Because an EDL holds one video track, a multilayer sequence must be output as several lists or flattened first. Effects other than dissolves and simple wipes do not survive; the usual practice is to export the EDL for conform and hand the effects over separately as an [AAF](/aaf-file/)."
        ]
      },
      {
        h2: "Validating an EDL before conform",
        body: [
          "`avid_analyze_edl` in the Avid Media Composer MCP server parses events, transitions, comment lines and motion effect lines with a native CMX-style parser and returns them as structured data with warnings for malformed events. It is a read-only inspection, so it can be pointed at a delivery folder to answer questions like which reels a list depends on, or whether the frame count mode is consistent across the file, before anyone loads it into a conform system."
        ]
      }
    ],
    faq: [
      {
        question: "What is an EDL file?",
        answer:
          "An EDL is an edit decision list: a plain-text file, usually CMX 3600, describing a cut as numbered events. Each event names a source reel, track, transition and four timecodes — source in and out, record in and out."
      },
      {
        question: "How do I export an EDL from Avid Media Composer?",
        answer:
          "Load the sequence, open EDL Manager or the List Tool, choose the CMX 3600 template, set the frame count mode to match the sequence, select the tracks, and save. Only one video track is output per list."
      },
      {
        question: "What does C or D mean in an EDL?",
        answer:
          "They are transition codes. C is a cut, D is a dissolve, W followed by a pattern number is a wipe and K is a key. Non-cut transitions are followed by a duration in frames."
      },
      {
        question: "What is the difference between an EDL and an AAF?",
        answer:
          "An EDL is plain text describing one video track of cuts and simple transitions. An AAF is a structured package carrying multiple tracks, effects, keyframes, descriptors and optionally the media itself. EDLs are used for conform and grading; AAFs for full picture and sound turnover."
      }
    ],
    tools: ["avid_analyze_edl", "avid_analyze_project"]
  },
  {
    slug: "bin-locking",
    metaTitle: "How Avid Bin Locking Works: .lck Files and Locked Bins",
    navLabel: "Bin locking",
    h1: "Avid bin locking,",
    h1Accent: "explained.",
    eyebrow: "Workflow guide",
    description:
      "How Avid Media Composer bin locking works on shared storage, what a .lck file is, why a bin stays locked at the file level after a crash, and how to audit active versus orphaned locks across a project.",
    primaryKeyword: "Avid bin locking",
    keywords: ["avid bin locking", "how does avid bin locking work", "avid bin is locked at the file level", "avid media composer bin locked", "avid open bin locked", "avid lck file", "orphaned bin lock avid"],
    answer:
      "Avid bin locking is how Media Composer prevents two editors from writing to the same bin at once in a shared project. When a user opens a bin with write access, Media Composer creates a lock file next to it in the project folder — the same base name with a `.lck` extension — recording who holds the bin. Other users on the shared volume see the bin as locked and can open it read-only. The lock is advisory and file-based, not a database transaction: if Media Composer exits uncleanly the `.lck` file survives, and the bin appears locked by a session that no longer exists. That leftover file is an orphaned lock.",
    sections: [
      {
        h2: "What a .lck file is",
        body: [
          "A `.lck` file is small, plain and sits directly beside the bin it guards. `Cut_v04.avb` is locked by `Cut_v04.lck` in the same directory. It records the identity of the user or workstation holding the bin, which is what Media Composer displays when another editor tries to open it.",
          "Because the mechanism is a file rather than a lock server, it works across any shared filesystem — Avid NEXIS, a SAN, or plain network storage — and it fails in the way file-based locks fail: the lock outlives the process that created it."
        ]
      },
      {
        h2: "\"Bin is locked at the file level\"",
        body: [
          "This message is different from ordinary bin locking, and the distinction matters. It means the operating system or storage layer is refusing write access to the `.avb` itself, not that another Avid user holds it.",
          "Common causes are read-only permissions on the project folder, a volume mounted read-only, a file marked read-only by a backup or sync tool, or an antivirus or cloud-sync client holding a handle on the file. Removing a `.lck` file does not fix this — the fix is at the filesystem or storage level."
        ]
      },
      {
        h2: "Clearing an orphaned lock",
        body: [
          "Before deleting any lock file, confirm nobody actually has the bin open. A lock deleted while a live session holds the bin invites two editors writing to the same file, which is exactly the outcome locking exists to prevent."
        ],
        list: [
          "Confirm with the person or workstation named in the lock that Media Composer is closed.",
          "Check for a running Media Composer process on that workstation, not just a closed window.",
          "Delete only the specific `.lck` file, never the `.avb` beside it.",
          "Reopen the bin. If it is still read-only, the problem is file-level permissions, not an Avid lock."
        ]
      },
      {
        h2: "Auditing locks across a project",
        body: [
          "On a large show, orphaned locks accumulate quietly and only surface when someone needs a bin. Auditing them is a read-only operation and is worth automating.",
          "`avid_inventory_project_files` in the Avid Media Composer MCP server classifies every file in a project tree by kind, `.lck` bin locks included, and reports where each lock sits relative to its bin. `avid_analyze_project` rolls that up into a per-project lock count. Both tools are read-only: they report locks and never delete them, because deciding that a lock is orphaned requires knowing whether a human still has the bin open."
        ]
      }
    ],
    faq: [
      {
        question: "How does Avid bin locking work?",
        answer:
          "When a user opens a bin with write access in a shared project, Media Composer writes a .lck file beside the bin recording who holds it. Other users see the bin as locked and open it read-only. The lock is a file, not a database transaction."
      },
      {
        question: "What is a .lck file in an Avid project?",
        answer:
          "A bin lock file. It sits in the project folder next to the bin it guards, shares the bin's base name, and records the user or workstation currently holding write access to that bin."
      },
      {
        question: "Why does Avid say the bin is locked at the file level?",
        answer:
          "Because the filesystem or storage layer is refusing write access to the .avb itself — read-only permissions, a read-only mount, a read-only file attribute, or a backup, antivirus or cloud-sync client holding the file. It is not an Avid bin lock, and deleting a .lck file will not clear it."
      },
      {
        question: "Is it safe to delete a .lck file?",
        answer:
          "Only after confirming that nobody has the bin open and no Media Composer process is running on the workstation named in the lock. Deleting a live lock allows two editors to write to the same bin, which can corrupt it. Delete only the .lck file, never the .avb."
      }
    ],
    tools: ["avid_inventory_project_files", "avid_analyze_project", "avid_analyze_bin"]
  },
  {
    slug: "compatibility",
    metaTitle: "Avid Media Composer Compatibility Matrix and System Requirements",
    navLabel: "Compatibility",
    h1: "Media Composer",
    h1Accent: "compatibility.",
    eyebrow: "Compatibility guide",
    description:
      "Which Avid Media Composer releases are supported on which Windows and macOS versions, how release-line matching works, and how to check a workstation combination automatically instead of reading a matrix.",
    primaryKeyword: "Avid Media Composer compatibility matrix",
    keywords: ["avid media composer compatibility matrix", "avid media composer os compatibility", "media composer compatibility", "avid media composer system requirements", "avid media composer windows 11", "avid media composer version matrix", "media composer macos support"],
    answer:
      "Avid publishes a Media Composer version matrix listing which release lines are qualified on which Windows and macOS versions. The Avid Media Composer MCP server carries a machine-readable snapshot of the three current tracks — the current release, the previous release, and the long-term-maintenance track — and evaluates a specific Media Composer, OS and CPU-architecture combination against them with the `avid_check_compatibility` tool. A match is a release, OS and architecture screening result. It is not an Avid qualification claim for a complete workstation, because GPU model and driver, I/O hardware, NEXIS and MediaCentral versions, plug-ins and licensing all affect whether a configuration is actually supported.",
    sections: [
      {
        h2: "Supported release tracks",
        body: [
          "The snapshot below was verified against Avid's product-scoped version matrix on 2026-08-15 and is regression-tested in the repository. Confirm against Avid's live matrix before committing a facility to an upgrade."
        ],
        table: {
          head: ["Release track", "Tier", "Windows", "macOS"],
          rows: [
            ["2025.12.x", "Current", "Windows 11 22H2+ Pro/Enterprise", "13.x–13.7.x, 14.x–14.8.x, 15.x–15.7.x, 26.2–26.6"],
            ["2025.6", "Previous", "Windows 10/11 22H2+ Pro/Enterprise", "13.x–13.7.x, 14.x–14.7.x, 15.x–15.5"],
            ["2024.12.x", "Long-term maintenance", "Windows 10/11 22H2+ Pro/Enterprise", "13.x–13.7.x, 14.x–14.7.x, 15.x–15.4.x"]
          ]
        }
      },
      {
        h2: "How release-line matching works",
        body: [
          "Avid ships patches within a release line, so a version string like `2025.12.2` is not a distinct compatibility entry. The MCP server resolves a patch to its release-line contract: `2025.12.2` is evaluated against the `2025.12` row.",
          "An unknown release line does not fall back to the nearest match. It fails closed, and any live bridge operation against that host is refused. Screening a host that nobody has qualified is worse than reporting that it is unqualified."
        ]
      },
      {
        h2: "What a compatibility match does not tell you",
        body: [
          "A release-and-OS match is a necessary condition, not a sufficient one. These factors sit outside the matrix and are checked separately."
        ],
        list: [
          "GPU model and driver version, which Avid qualifies independently of the OS.",
          "Whether the computer model itself appears on Avid's qualified hardware list.",
          "I/O hardware and its driver — Blackmagic, AJA and Avid's own interfaces each have their own qualified versions.",
          "Shared storage and asset management versions: NEXIS client, MediaCentral, Interplay.",
          "Plug-ins, AVX effects and AAX audio plug-ins, which are qualified per release.",
          "Licensing and activation state, which can block launch on an otherwise qualified machine."
        ]
      },
      {
        h2: "Checking a workstation automatically",
        body: [
          "Four tools cover this ground without anyone opening a knowledge base article. `avid_get_compatibility_matrix` returns the machine-readable matrix and its source URLs. `avid_check_compatibility` evaluates one Media Composer, OS and architecture combination. `avid_detect_installations` finds Media Composer in the standard Windows and macOS locations. `avid_diagnose_integrations` separates the prerequisites for AMA, AMT, AVX, AAX, NEXIS and Distributed Processing so a failing integration is attributed to the right layer.",
          "A scheduled drift check in the repository re-fetches Avid's official matrix weekly and fails the run when the snapshot no longer matches, so the data above is asserted rather than assumed. The check never rewrites compatibility data on its own — a mismatch requires human review of the official source."
        ]
      }
    ],
    faq: [
      {
        question: "Which Avid Media Composer versions are currently supported?",
        answer:
          "Three tracks: 2025.12.x as the current release, 2025.6 as the previous release, and 2024.12.x as the long-term-maintenance track. Each has its own qualified Windows and macOS versions."
      },
      {
        question: "Does Avid Media Composer run on Windows 11?",
        answer:
          "Yes. All three current tracks qualify Windows 11 22H2 or newer, Pro or Enterprise editions. Windows 10 22H2 remains qualified for the 2025.6 and 2024.12.x tracks only."
      },
      {
        question: "How do I check whether my system is compatible with Media Composer?",
        answer:
          "Compare your release line, OS version and CPU architecture against Avid's version matrix, then verify GPU, I/O hardware, storage client and plug-in versions separately. The avid_check_compatibility tool automates the first part and reports the rest as separate checks."
      },
      {
        question: "Does an OS match mean my workstation is qualified?",
        answer:
          "No. A release, OS and architecture match is a screening result. GPU and driver, qualified computer model, I/O hardware, NEXIS and MediaCentral versions, plug-ins and licensing all affect whether Avid considers the full configuration supported."
      }
    ],
    tools: ["avid_get_compatibility_matrix", "avid_check_compatibility", "avid_detect_installations", "avid_diagnose_integrations"]
  },
  {
    slug: "ai-automation",
    metaTitle: "AI Tools and Automation for Avid Media Composer",
    navLabel: "AI and automation",
    h1: "AI and automation for",
    h1Accent: "Media Composer.",
    eyebrow: "Workflow guide",
    description:
      "What can actually be automated in Avid Media Composer today: Avid's own AI features, the Extensions SDK, and how an MCP server lets Claude, Cursor or ChatGPT read Avid projects, AAF, ALE and EDL without an API.",
    primaryKeyword: "Avid Media Composer AI",
    keywords: ["avid media composer ai", "ai tools for avid media composer", "avid media composer automation", "avid media composer api", "avid media composer panel sdk", "avid media composer extensions", "ai video editing avid", "mcp server for video editing"],
    answer:
      "Avid Media Composer has no general-purpose scripting API of the kind After Effects or Premiere Pro expose. Automation happens in three places: Avid's own built-in AI features such as PhraseFind AI and ScriptSync AI, which run inside the application; the Media Composer Extensions SDK (called the Panel SDK before the 2025.12 release), which lets a registered developer embed a panel that drives the application; and offline analysis of the project's files, which needs nothing installed at all. The third route is where AI assistants are practically useful today: an MCP server can read `.avp` projects, `.avb` bins, AAF, ALE, EDL and media metadata directly from disk and answer questions about a cut without Media Composer running.",
    sections: [
      {
        h2: "What Avid ships built in",
        body: [
          "Avid's own AI features live inside Media Composer and are not programmable from outside it."
        ],
        list: [
          "PhraseFind AI: phonetic and transcript search across a project's media, letting an editor find spoken words without logging them first.",
          "ScriptSync AI: automatic alignment of takes against a script, so a script-based edit builds itself from the transcript.",
          "Automatic transcription, which produces the text those two features search.",
          "Media Composer's own effect and colour tooling, which is drivable only through the Extensions SDK."
        ]
      },
      {
        h2: "Is there an Avid Media Composer API?",
        body: [
          "Not a public scripting API. What exists is the Media Composer Extensions SDK — called the Panel SDK before the 2025.12 release, where it appears in the application's Extensions menu. An extension is a component that runs alongside Media Composer and can drive parts of the application.",
          "Access is through Avid's developer onboarding rather than a public download, so the SDK is not a route a facility can take unilaterally. Anything that claims to edit a live Media Composer timeline needs a compatible extension installed on that host — no extension, no live editing."
        ]
      },
      {
        h2: "What an MCP server adds",
        body: [
          "The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard for connecting AI clients to tools and data. An MCP server for Avid exposes the project's files as structured tools, so any MCP-capable client — Claude Desktop, Claude Code, Cursor, VS Code, Codex, LM Studio — can query them in natural language.",
          "This works because an Avid project is a directory of files on disk. Reading them requires no API, no extension and no running application, which is why it is available today while live timeline control is not."
        ],
        list: [
          "Ask which bins in a show contain sequences over a given duration, or which are locked and by whom.",
          "Check an [AAF](/aaf-file/) for missing media, rate mismatches or unsupported effects before a conform.",
          "Validate a delivered [ALE](/ale-file/) against the columns a batch import needs.",
          "Report which reels an [EDL](/edl-file/) depends on, and whether the frame count mode is consistent.",
          "Confirm a workstation's Media Composer, OS and architecture combination against the current [version matrix](/compatibility/).",
          "Inventory a project tree by file kind, with checksums, before an archive or migration."
        ]
      },
      {
        h2: "Where the safety boundary sits",
        body: [
          "Handing an AI assistant a directory of live editorial work is only reasonable if the boundary is enforced rather than promised. The Avid Media Composer MCP server draws it in three places.",
          "Offline analysis is read-only: project files, bins and source media are never modified. Access is confined to explicitly configured allowed roots, so the server cannot wander outside the folders it was pointed at. And live editing is gated on a separately installed, compatible Avid Extension bridge that must advertise the specific operation being requested — without a fresh bridge that does, the operation fails closed rather than degrading into a guess."
        ]
      }
    ],
    faq: [
      {
        question: "Can AI edit an Avid Media Composer timeline?",
        answer:
          "Not without a compatible Avid Extension installed on that host. Media Composer has no public scripting API, so an AI client can read a project's files offline today, but changing a live timeline requires an extension that advertises the specific operation."
      },
      {
        question: "Does Avid Media Composer have an API?",
        answer:
          "There is no public scripting API. The Media Composer Extensions SDK — the Panel SDK before the 2025.12 release — is the supported integration route, and access goes through Avid's developer onboarding rather than a public download."
      },
      {
        question: "What AI features does Avid Media Composer include?",
        answer:
          "PhraseFind AI for phonetic and transcript search across project media, ScriptSync AI for aligning takes against a script, and automatic transcription that feeds both. They run inside the application and are not programmable from outside it."
      },
      {
        question: "How do I connect Claude to Avid Media Composer?",
        answer:
          "Install the Avid Media Composer MCP server, set AVID_MCP_ALLOWED_ROOTS to your project folder, and add the server to Claude Desktop or Claude Code's MCP configuration. Claude can then analyse projects, bins, AAF, ALE, EDL and media metadata directly."
      },
      {
        question: "Is there an MCP server for video editing?",
        answer:
          "Yes for Avid Media Composer: an open-source MCP server exposes read-only project, AVB, AAF, ALE, EDL, configuration and media analysis to any MCP-compatible AI client, with guarded live editing behind a separately installed Avid Extension bridge."
      }
    ],
    tools: ["avid_analyze_project", "avid_analyze_bin", "avid_analyze_aaf", "avid_get_capabilities"]
  }
]

export const guideBySlug = new Map(guides.map(guide => [guide.slug, guide]))
export const guidePath = (slug: string) => `/${slug}/`
