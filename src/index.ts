import * as core from '@actions/core';
import * as github from '@actions/github';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/core';
import { Project } from './project.js';
import { ProjectV2ItemFieldSingleSelectValue, ProjectV2SingleSelectField, ProjectV2SingleSelectFieldOption } from '@octokit/graphql-schema';
import { isIssue, isSingleSelectField } from './typeguards.js';
import { Issue } from './types.js';

const ThrottledOctokit = Octokit.plugin(throttling);

function getLabels(issue: Issue, includeIssueType: boolean = true): string[] {
    const labels: string[] = [];

    if (issue.labels && issue.labels.nodes) {
        labels.push(...issue.labels.nodes.map(l => l!.name.toLocaleLowerCase()));
    }

    if (includeIssueType && issue.issueType && issue.issueType.name) {
        labels.push(issue.issueType.name.toLocaleLowerCase());
    }

    return labels;
}

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
    const graphql = octoKit.graphql.defaults({
        headers: {
            "GraphQL-Features": "issue_types"
        }
    })

    if (github.context.payload.action === 'opened' || github.context.payload.action === 'labeled') {
        const owner = core.getInput("owner-name", { required: true });
        const projectId = Number(core.getInput("project-id", { required: true }));

        const project = new Project(graphql, owner, projectId);
        await project.initialize();

        const fieldName = core.getInput("field-name", { required: true });
        const field = project.getFieldByName<ProjectV2SingleSelectField>(fieldName);

        const optionMap = new Map<string, ProjectV2SingleSelectFieldOption>();
        field.options.forEach(o => optionMap.set(o.name.toLocaleLowerCase(), o));

        const issueNumber = github.context.payload.issue!.number;
        const repositoryName = github.context.repo.repo;
        const item = await project.getItem(repositoryName, issueNumber);

        if (item && isIssue(item.content)) {
            const issue = item.content;
            const labels = getLabels(issue, false);
            const matchingLabel = labels.find(l => optionMap.has(l));

            if (matchingLabel) {
                const option = optionMap.get(matchingLabel)!;
                const optionId = option.id;
                const fieldValue = item.fieldValues.nodes?.find(v => isSingleSelectField(v) && v.field.id === field.id) as ProjectV2ItemFieldSingleSelectValue;
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
                } else {
                    console.log(`Issue ${issue.number} with ${matchingLabel} already set to ${fieldValue.optionId}`);
                }
            }
        } else {
            console.log(`Issue ${repositoryName}#${issueNumber} not found on project ${projectId}`);
        }
    }
}


run();