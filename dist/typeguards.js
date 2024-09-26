"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSingleSelectField = exports.isIssue = void 0;
function isIssue(item) {
    return (item && item.__typename == "Issue") || false;
}
exports.isIssue = isIssue;
function isSingleSelectField(item) {
    return (item && item.__typename == "ProjectV2ItemFieldSingleSelectValue") || false;
}
exports.isSingleSelectField = isSingleSelectField;
//# sourceMappingURL=typeguards.js.map