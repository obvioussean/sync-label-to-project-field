import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/core';
import { Project } from './project.js';
import { isIssue, isSingleSelectField } from './typeguards.js';
const ThrottledOctokit = Octokit.plugin(throttling);
const token = `${process.env.PAT_TOKEN}`;
const octoKit = new ThrottledOctokit({
    auth: token,
    previews: ["cloak"],
    throttle: {
        onRateLimit: (retryAfter, options, octokit) => {
            octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
            octokit.log.info(`Retrying after ${retryAfter} seconds for the ${options.request.retryCount} time!`);
            return true;
        },
        onSecondaryRateLimit: (retryAfter, options, octokit) => {
            // does not retry, only logs a warning
            octokit.log.warn(`Abuse detected for request ${options.method} ${options.url}`);
            octokit.log.info(`Retrying after ${retryAfter} seconds for the ${options.request.retryCount} time!`);
            return true;
        },
    },
});
const graphql = octoKit.graphql.defaults({
    headers: {
        "GraphQL-Features": "issue_types"
    }
});
function getLabels(issue, includeIssueType = true) {
    const labels = [];
    if (issue.labels && issue.labels.nodes) {
        labels.push(...issue.labels.nodes.map(l => l.name.toLocaleLowerCase()));
    }
    if (includeIssueType && issue.issueType && issue.issueType.name) {
        labels.push(issue.issueType.name.toLocaleLowerCase());
    }
    return labels;
}
(async () => {
    const project = new Project(graphql, "github", 3898);
    await project.initialize();
    const fields = project.getFields();
    const field = fields.find(f => f.name == "Stream");
    const optionMap = new Map();
    field.options.forEach(o => optionMap.set(o.name.toLocaleLowerCase(), o));
    const item = await project.getItem("security-center", 2613);
    if (isIssue(item.content)) {
        const issue = item.content;
        const labels = getLabels(issue, false);
        for (const label of labels) {
            if (optionMap.has(label)) {
                const option = optionMap.get(label);
                const optionId = option.id;
                const fieldValue = item.fieldValues.nodes.find(v => isSingleSelectField(v) && v.field.id === field.id);
                if (!fieldValue || fieldValue.optionId !== optionId) {
                    console.log(`Updating issue ${issue.number}, setting field to ${option.name}`);
                    await project.updateProjectItemFieldValue({
                        projectId: project.getId(),
                        itemId: item.id,
                        fieldId: field.id,
                        value: {
                            singleSelectOptionId: optionId
                        },
                    });
                }
                else {
                    console.log(`Issue ${issue.number} with ${label} already set to ${fieldValue.optionId}`);
                }
                return;
            }
        }
    }
})();
//# sourceMappingURL=app.js.map