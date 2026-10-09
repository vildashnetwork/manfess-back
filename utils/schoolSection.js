export function normalizeSchoolSection(value, fallback = "englophone") {
    void value;
    void fallback;
    return "englophone";
}

export function buildSchoolSectionFilter(req, fieldName = "section") {
    const section = normalizeSchoolSection(req?.query?.section ?? req?.get?.("x-school-section") ?? "", "");
    return section ? { [fieldName]: section } : {};
}

// Inclusive variant: also matches legacy documents created before the
// `section` field existed (missing / null / empty). Use this for every
// read filter so old data never disappears from the interface once the
// frontend starts sending ?section=englophone.
export function buildInclusiveSectionFilter(req, fieldName = "section") {
    const section = normalizeSchoolSection(req?.query?.section ?? req?.get?.("x-school-section") ?? "", "");
    if (!section) return {};
    return {
        $or: [
            { [fieldName]: section },
            { [fieldName]: { $exists: false } },
            { [fieldName]: null },
            { [fieldName]: "" }
        ]
    };
}