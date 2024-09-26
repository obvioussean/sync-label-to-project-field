import * as core from '@actions/core';
import * as github from '@actions/github';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/core';
import { Project } from './project';
import { ProjectV2ItemFieldSingleSelectValue, ProjectV2SingleSelectField } from '@octokit/graphql-schema';
import { isIssue, isSingleSelectField } from './typeguards';

const ThrottledOctokit = Octokit.plugin(throttling);

async function run(): Promise<void> {
    const token = `${process.env.PAT_TOKEN}`;
    const octoKit = new ThrottledOctokit({
        auth: token,
        previews: ["cloak"],
        throttle: {
            onRateLimit: (retryAfter: number, options: any, octokit: any) => {
                octokit.log.warn(
                    `Request quota exhausted for request ${options.method} ${options.url}`
                );

                octokit.log.info(`Retrying after ${retryAfter} seconds for the ${options.request.retryCount} time!`);

                return true;
            },
            onSecondaryRateLimit: (retryAfter: number, options: any, octokit: any) => {
                // does not retry, only logs a warning
                octokit.log.warn(
                    `Abuse detected for request ${options.method} ${options.url}`
                );

                octokit.log.info(`Retrying after ${retryAfter} seconds for the ${options.request.retryCount} time!`);

                return true;
            },
        },
    });
    const graphql = octoKit.graphql;

    const owner = core.getInput("owner", { required: true });
    const projectId = Number(core.getInput("project-id", { required: true }));

    const project = new Project(graphql, owner, projectId);
    await project.initialize();

    const fieldName = core.getInput("field-name", { required: true });
    const field = project.getFieldByName<ProjectV2SingleSelectField>(fieldName);

    const labelOverrides = new Map<string, string>();
    const overrides = core.getMultilineInput("label-overrides", { required: false });

    const optionMap = new Map<string, string>();
    field.options.forEach(o => optionMap.set(o.name.toLocaleLowerCase(), o.id));

    const labelToOptionMap = new Map<string, string>();
    // assume each option maps 1:1 to a label
    optionMap.forEach((_, o) => labelToOptionMap.set(o, o));
    // add the label overrides 
    labelOverrides.forEach((v, k) => labelToOptionMap.set(k.toLocaleLowerCase(), v));

    const items = await project.getItems();
    for (const item of items) {
        if (isIssue(item.content)) {
            const issue = item.content;
            if (issue.labels && issue.labels.nodes) {
                const labels = issue.labels.nodes.map(l => l!.name.toLocaleLowerCase());
                const label = labels.find(l => labelToOptionMap.has(l));
                console.log(`Issue ${issue.id} has labels ${JSON.stringify(labels)}, found ${label}`);
                if (label) {
                    const option = labelToOptionMap.get(label)!;
                    const optionId = optionMap.get(option);
                    const fieldValue = item.fieldValues.nodes!.find(v => isSingleSelectField(v) && v.field.id === field.id) as ProjectV2ItemFieldSingleSelectValue;
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
                    } else {
                        console.log(`Issue ${issue.number} with ${label} already set to ${fieldValue.optionId}`);
                    }
                } else {
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