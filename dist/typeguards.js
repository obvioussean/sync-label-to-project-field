export function isIssue(item) {
    return (item && item.__typename == "Issue") || false;
}
export function isSingleSelectField(item) {
    return (item && item.__typename == "ProjectV2ItemFieldSingleSelectValue") || false;
}
//# sourceMappingURL=typeguards.js.map