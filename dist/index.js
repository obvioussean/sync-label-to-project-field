"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const plugin_throttling_1 = require("@octokit/plugin-throttling");
const core_1 = require("@octokit/core");
const project_1 = require("./project");
const typeguards_1 = require("./typeguards");
const ThrottledOctokit = core_1.Octokit.plugin(plugin_throttling_1.throttling);
async function run() {
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
    const owner = core.getInput("owner", { required: true });
    const projectId = Number(core.getInput("project-id", { required: true }));
    const project = new project_1.Project(graphql, owner, projectId);
    await project.initialize();
    const fieldName = core.getInput("field-name", { required: true });
    const field = project.getFieldByName(fieldName);
    const labelOverrides = new Map();
    const overrides = core.getMultilineInput("label-overrides", { required: false });
    const optionMap = new Map();
    field.options.forEach(o => optionMap.set(o.name.toLocaleLowerCase(), o.id));
    const labelToOptionMap = new Map();
    // assume each option maps 1:1 to a label
    optionMap.forEach((_, o) => labelToOptionMap.set(o, o));
    // add the label overrides 
    labelOverrides.forEach((v, k) => labelToOptionMap.set(k.toLocaleLowerCase(), v));
    const items = await project.getItems();
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
}
run();
//# sourceMappingURL=index.js.map