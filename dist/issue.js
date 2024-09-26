"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSingleSelectField = exports.isIssue = void 0;
function isIssue(item) {
    return item.__typename == "Issue";
}
exports.isIssue = isIssue;
function isSingleSelectField(item) {
    return item.__typename == "ProjectV2ItemFieldSingleSelectValue";
}
exports.isSingleSelectField = isSingleSelectField;
//# sourceMappingURL=issue.js.map