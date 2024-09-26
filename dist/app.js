"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const project_1 = require("./project");
const plugin_throttling_1 = require("@octokit/plugin-throttling");
const core_1 = require("@octokit/core");
const typeguards_1 = require("./typeguards");
const ThrottledOctokit = core_1.Octokit.plugin(plugin_throttling_1.throttling);
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
const graphql = octoKit.graphql;
(async () => {
    const project = new project_1.Project(graphql, "github", 3898);
    await project.initialize();
    const fields = project.getFields();
    const items = await project.getItems();
    const labelOverrides = new Map();
    labelOverrides.set("task", "feature-work");
    labelOverrides.set("feature", "feature-work");
    labelOverrides.set("bug", "investigation");
    labelOverrides.set("shield", "investigation");
    labelOverrides.set("engineering-debt", "investigation");
    labelOverrides.set("feature flag", "feature-flag");
    labelOverrides.set("design-initiative", "product");
    labelOverrides.set("needs-design", "product");
    labelOverrides.set("🎨 needs-design", "product");
    labelOverrides.set("design-only", "product");
    const field = fields.find(f => f.name == "Backlog category");
    const optionMap = new Map();
    field.options.forEach(o => optionMap.set(o.name.toLocaleLowerCase(), o.id));
    const labelToOptionMap = new Map();
    // assume each option maps 1:1 to a label
    optionMap.forEach((_, o) => labelToOptionMap.set(o, o));
    // add the label overrides 
    labelOverrides.forEach((v, k) => labelToOptionMap.set(k.toLocaleLowerCase(), v));
    for (const item of items) {
        if ((0, typeguards_1.isIssue)(item.content)) {
            const issue = item.content;
            if (issue.labels && issue.labels.nodes) {
                const labels = issue.labels.nodes.map(l => l.name.toLocaleLowerCase());
                const label = labels.find(l => labelToOptionMap.has(l));
                console.log(`Issue ${issue.id} has labels ${JSON.stringify(labels)}, found ${label}`);
                if (label) {
                    const option = labelToOptionMap.get(label);
                    const optionId = optionMap.get(option);
                    const fieldValue = item.fieldValues.nodes.find(v => (0, typeguards_1.isSingleSelectField)(v) && v.field.id === field.id);
                    if (!fieldValue || fieldValue.optionId !== optionId) {
                        console.log(`Updating issue ${issue.number}, setting field to ${option}`);
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
                }
                else {
                    console.log(`Updating issue ${issue.number}, clearing the field since it has no matching label`);
                    await project.clearProjectItemFieldValue({
                        projectId: project.getId(),
                        itemId: item.id,
                        fieldId: field.id,
                    });
                }
            }
        }
    }
})();
//# sourceMappingURL=app.js.map