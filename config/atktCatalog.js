const slugify = (value = "") =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const subjectEntry = (batchId, patternId, label, extra = {}) => ({
  id: `${slugify(batchId)}-${slugify(patternId)}-${slugify(label)}`,
  label,
  type: "subject",
  ...extra,
});

const sectionEntry = (batchId, patternId, label) => ({
  id: `${slugify(batchId)}-${slugify(patternId)}-${slugify(label)}`,
  label,
  type: "section",
});

const ATKT_CATALOG = {
  courses: [
    {
      id: "ba-llb",
      label: "BA LLB",
      value: "BA LLB",
      batches: ["FYBA-LLB", "SYBA-LLB", "TYBA-LLB", "IVBA-LLB"],
    },
    {
      id: "llb",
      label: "LLB",
      value: "LLB",
      batches: ["FYLLB", "SYLLB"],
    },
  ],
  patterns: [
    { id: "75-25", label: "75:25", value: "75:25" },
    { id: "60-40", label: "60:40", value: "60:40" },
  ],
  batches: {
    FYLLB: {
      course: "LLB",
      label: "FYLLB",
      patterns: {
        "75:25": {
          subjects: [
            subjectEntry("FYLLB", "75:25", "Bharatiya Nyaya Sanhita"),
            subjectEntry("FYLLB", "75:25", "Constitutional Law - I"),
            subjectEntry("FYLLB", "75:25", "Family Law - I"),
            subjectEntry("FYLLB", "75:25", "Environmental Law"),
            subjectEntry("FYLLB", "75:25", "D.P.C.-I"),
          ],
        },
        "60:40": {
          subjects: [
            subjectEntry("FYLLB", "60:40", "Law of Crimes"),
            subjectEntry("FYLLB", "60:40", "Constitutional Law"),
            subjectEntry("FYLLB", "60:40", "Family Law-I"),
            subjectEntry("FYLLB", "60:40", "Environmental Law"),
            subjectEntry("FYLLB", "60:40", "D.C.P.-I"),
          ],
        },
      },
    },
    SYLLB: {
      course: "LLB",
      label: "SYLLB",
      patterns: {
        "75:25": {
          subjects: [
            subjectEntry("SYLLB", "75:25", "Jurisprudence / Legal Theory"),
            subjectEntry("SYLLB", "75:25", "Contract - II"),
            subjectEntry("SYLLB", "75:25", "Constitutional Law - II"),
            subjectEntry("SYLLB", "75:25", "D.P.C. II"),
            sectionEntry("SYLLB", "75:25", "Optional Papers (Any one)"),
            subjectEntry("SYLLB", "75:25", "Criminology and Penology", {
              group: "optional",
            }),
            subjectEntry("SYLLB", "75:25", "Bankruptcy Laws", {
              group: "optional",
            }),
            subjectEntry("SYLLB", "75:25", "Human Rights Law", {
              group: "optional",
            }),
          ],
        },
        "60:40": {
          subjects: [
            subjectEntry("SYLLB", "60:40", "Legal Theory"),
            subjectEntry("SYLLB", "60:40", "Contract-II"),
            subjectEntry("SYLLB", "60:40", "Land Law"),
            subjectEntry("SYLLB", "60:40", "D.C.P.-II"),
            sectionEntry("SYLLB", "60:40", "Optional Papers (Any one)"),
            subjectEntry("SYLLB", "60:40", "Criminology", {
              group: "optional",
            }),
            subjectEntry("SYLLB", "60:40", "Taxation Laws", {
              group: "optional",
            }),
            subjectEntry("SYLLB", "60:40", "Law of Insolvency", {
              group: "optional",
            }),
          ],
        },
      },
    },
    "FYBA-LLB": {
      course: "BA LLB",
      label: "FYBA-LLB",
      patterns: {
        "75:25": {
          subjects: [
            subjectEntry("FYBA-LLB", "75:25", "History"),
            subjectEntry("FYBA-LLB", "75:25", "Legal Language & Writing"),
            subjectEntry("FYBA-LLB", "75:25", "Political Science - I"),
          ],
        },
        "60:40": {
          subjects: [],
        },
      },
    },
    "SYBA-LLB": {
      course: "BA LLB",
      label: "SYBA-LLB",
      patterns: {
        "75:25": {
          subjects: [
            subjectEntry("SYBA-LLB", "75:25", "English - II"),
            subjectEntry("SYBA-LLB", "75:25", "Logic - II"),
            subjectEntry("SYBA-LLB", "75:25", "Political Science - III"),
          ],
        },
        "60:40": {
          subjects: [],
        },
      },
    },
    "TYBA-LLB": {
      course: "BA LLB",
      label: "TYBA-LLB",
      patterns: {
        "75:25": {
          subjects: [
            subjectEntry("TYBA-LLB", "75:25", "Bharatiya Nyaya Sanhita"),
            subjectEntry("TYBA-LLB", "75:25", "Constitutional Law - I"),
            subjectEntry("TYBA-LLB", "75:25", "Family Law - I"),
            subjectEntry("TYBA-LLB", "75:25", "Environmental Law"),
            subjectEntry("TYBA-LLB", "75:25", "D.P.C.-I"),
          ],
        },
        "60:40": {
          subjects: [
            subjectEntry("TYBA-LLB", "60:40", "Labour Laws"),
            subjectEntry("TYBA-LLB", "60:40", "Contract-I"),
            subjectEntry(
              "TYBA-LLB",
              "60:40",
              "Law of Torts & Consumer Protection",
            ),
            subjectEntry("TYBA-LLB", "60:40", "Legal Language"),
            subjectEntry("TYBA-LLB", "60:40", "Practical Training - I"),
          ],
        },
      },
    },
    "IVBA-LLB": {
      course: "BA LLB",
      label: "IVBA-LLB",
      patterns: {
        "75:25": {
          subjects: [
            subjectEntry("IVBA-LLB", "75:25", "Jurisprudence / Legal Theory"),
            subjectEntry("IVBA-LLB", "75:25", "Contract - II"),
            subjectEntry("IVBA-LLB", "75:25", "Constitutional Law - II"),
            subjectEntry("IVBA-LLB", "75:25", "D.P.C. II"),
            sectionEntry("IVBA-LLB", "75:25", "Optional Papers (Any one)"),
            subjectEntry("IVBA-LLB", "75:25", "Criminology and Penology", {
              group: "optional",
            }),
            subjectEntry("IVBA-LLB", "75:25", "Bankruptcy Laws", {
              group: "optional",
            }),
            subjectEntry("IVBA-LLB", "75:25", "Human Rights Law", {
              group: "optional",
            }),
          ],
        },
        "60:40": {
          subjects: [
            subjectEntry("IVBA-LLB", "60:40", "Legal Theory"),
            subjectEntry("IVBA-LLB", "60:40", "Contract - II"),
            subjectEntry("IVBA-LLB", "60:40", "Land Law"),
            subjectEntry("IVBA-LLB", "60:40", "D.C.P.-II"),
            sectionEntry("IVBA-LLB", "60:40", "Optional Papers (Any one)"),
            subjectEntry("IVBA-LLB", "60:40", "Criminology", {
              group: "optional",
            }),
            subjectEntry("IVBA-LLB", "60:40", "Taxation Laws", {
              group: "optional",
            }),
            subjectEntry("IVBA-LLB", "60:40", "Law of Insolvency", {
              group: "optional",
            }),
          ],
        },
      },
    },
  },
};

export const getAtktCatalog = () => ATKT_CATALOG;

export const getBatchDetails = (batchName) =>
  ATKT_CATALOG.batches[batchName] || null;

export const getPatternDetails = (batchName, pattern) => {
  const batch = getBatchDetails(batchName);
  if (!batch) return null;
  return batch.patterns[pattern] || null;
};

export const listSelectableSubjects = (batchName, pattern) => {
  const patternDetails = getPatternDetails(batchName, pattern);
  if (!patternDetails) return [];
  return patternDetails.subjects.filter(
    (subject) => subject.type !== "section",
  );
};

export default ATKT_CATALOG;
