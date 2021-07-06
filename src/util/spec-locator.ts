import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Disposable } from '../api/disposable';
import { Logger } from '../core/logger';
import * as glob from 'glob';

enum TestNodeType {
	Suite = 'describe',
	Test = 'it'
}

interface TestNodeInfo {
	description: string;
	lineNumber: number | undefined;
}

type TestSuiteFileInfo = Record<TestNodeType, TestNodeInfo[]>;

export interface SpecLocation {
	file: string;
	line: number;
}

export interface SpecFileInfo {
	suiteName: string;
	specCount: number;
}

export interface SpecLocatorOptions extends Partial<glob.IOptions> {
	cwd?: string;
	ignore?: string[];
	fileEncoding?: string;
}

const DEFAULT_FRAMEWORK_SPEC_REGEX: RegExp =
	/((^|\n)(\d+)\.)?\s+[xf]?(describe|it)\s*\(\s*((?<![\\])[\`\'\"])((?:.(?!(?<![\\])\5))*.?)\5/gis;
const DEFAULT_FILE_ENCODING = 'utf-8';

export class SpecLocator implements Disposable {
	private readonly fileInfoMap: Map<string, TestSuiteFileInfo> = new Map();
	private readonly specFilesBySuite: Map<string, string[]> = new Map();
	private readonly cwd: string;

	public constructor(
		private readonly filePatterns: string[],
		private readonly logger: Logger,
		private readonly specLocatorOptions: SpecLocatorOptions = {}
	) {
		this.cwd = specLocatorOptions.cwd ?? process.cwd();
		this.reload();
	}

	public reload() {
		this.fileInfoMap.clear();
		this.specFilesBySuite.clear();

		const fileEncoding = this.specLocatorOptions.fileEncoding ?? DEFAULT_FILE_ENCODING;
		let loadedFileCount: number = 0;

		this.getAbsoluteFilesForGlobs(this.filePatterns).forEach(filePath => {
			this.processFile(filePath, fileEncoding);
			loadedFileCount++;
		});

		this.logger.info(`Spec locator loaded ${loadedFileCount} spec files`);
	}

	private getAbsoluteFilesForGlobs(fileGlobs: string[]): string[] {
		return fileGlobs
			.map(patternString => glob.sync(patternString, this.specLocatorOptions))
			.reduce((consolidatedPaths = [], morePaths) => [...consolidatedPaths, ...morePaths])
			.map(filePath => resolve(this.cwd, filePath));
	}

	private processFile(fileAbsolutePath: string, fileEncoding?: string) {
		const fileTestInfo = this.parseTestSuiteFile(fileAbsolutePath, fileEncoding);
		this.fileInfoMap.set(fileAbsolutePath, fileTestInfo);

		if (fileTestInfo[TestNodeType.Suite].length === 0) {
			return;
		}
		const fileTopSuite = [fileTestInfo[TestNodeType.Suite][0].description];
		this.addSuiteFileToCache(fileTopSuite, fileAbsolutePath);
	}

	public getSpecLocation(specSuite: string[], specDescription?: string): SpecLocation[] {
		if (specSuite.length === 0) {
			return [];
		}
		const specFiles = this.getSuiteFilesFromCache(specSuite);

		if (specFiles) {
			const specLocations: SpecLocation[] = specFiles
				.map((specFile: string): SpecLocation | undefined => {
					const specLine = this.getSpecLineNumber(this.fileInfoMap.get(specFile), specSuite, specDescription);
					return specLine ? { file: specFile, line: specLine } : undefined;
				})
				.filter(specLocation => specLocation !== undefined) as SpecLocation[];

			return specLocations;
		}

		const specLocations: SpecLocation[] = [];

		for (const specFile of this.fileInfoMap.keys()) {
			const specLineNumber = this.getSpecLineNumber(this.fileInfoMap.get(specFile), specSuite, specDescription);

			if (specLineNumber !== undefined) {
				this.addSuiteFileToCache(specSuite, specFile);
				specLocations.push({ file: specFile, line: specLineNumber });
			}
		}
		return specLocations;
	}

	public isSpecFile(filePath: string): boolean {
		const fileAbsolutePath = resolve(this.cwd, filePath);
		const specFileAbsolutePaths = this.getAbsoluteFilesForGlobs(this.filePatterns);
		return specFileAbsolutePaths.includes(fileAbsolutePath);
	}

	private addSuiteFileToCache(suite: string[], filePath: string) {
		let suiteKey = '';

		for (const suiteAncestor of suite) {
			suiteKey = suiteKey ? `${suiteKey} ${suiteAncestor}` : suiteAncestor;

			if (!this.specFilesBySuite.has(suiteKey)) {
				this.specFilesBySuite.set(suiteKey, []);
			}
			const suiteFiles = this.specFilesBySuite.get(suiteKey)!;
			if (!suiteFiles.includes(filePath)) {
				suiteFiles.push(filePath);
			}
		}
	}

	private getSuiteFilesFromCache(suite: string[]): string[] | undefined {
		let suiteKey = '';

		for (const suiteAncestor of suite) {
			suiteKey = suiteKey ? `${suiteKey} ${suiteAncestor}` : suiteAncestor;
			const suiteFiles = this.specFilesBySuite.get(suiteKey);

			if (suiteFiles) {
				return suiteFiles;
			}
		}
		return undefined;
	}

	private getSpecLineNumber(
		testFileNodeList: TestSuiteFileInfo | undefined,
		specSuite: string[] | undefined,
		specDescription?: string | undefined
	): number | undefined {
		if (!testFileNodeList || !specSuite) {
			return undefined;
		}

		const findNode = (
			nodeType: TestNodeType,
			nodeDescription: string,
			startNode?: TestNodeInfo,
			inclusive: boolean = false
		): TestNodeInfo | undefined => {
			const nodeList = testFileNodeList[nodeType];
			let searchIndex = startNode ? nodeList.indexOf(startNode) + (inclusive ? 0 : 1) : 0;

			while (searchIndex < nodeList.length) {
				const node = nodeList[searchIndex];

				if (node.description === nodeDescription) {
					return node;
				}
				searchIndex++;
			}
			return undefined;
		};

		const suiteNamesToFind = specSuite ?? [];
		let lastSuiteNodeFound: TestNodeInfo | undefined;

		for (const suiteName of suiteNamesToFind) {
			lastSuiteNodeFound = findNode(TestNodeType.Suite, suiteName);

			if (!lastSuiteNodeFound) {
				break;
			}
		}

		if (lastSuiteNodeFound?.lineNumber === undefined) {
			return undefined;
		}

		if (specDescription === undefined) {
			return lastSuiteNodeFound.lineNumber;
		}

		const itSearchStartNode = testFileNodeList[TestNodeType.Test].find(
			testNode =>
				testNode.lineNumber !== undefined &&
				lastSuiteNodeFound!.lineNumber !== undefined &&
				testNode.lineNumber > lastSuiteNodeFound!.lineNumber
		);

		if (itSearchStartNode === undefined) {
			return undefined;
		}

		const itSpecFoundNode = findNode(TestNodeType.Test, specDescription, itSearchStartNode, true);

		if (!itSpecFoundNode) {
			return undefined;
		}

		return itSpecFoundNode.lineNumber;
	}

	private getTestFileData(path: string, encoding?: string): string {
		const fileText = this.readFile(path, encoding)
			.split('\n')
			.map((lineText, lineNumber) => `${lineNumber}. ${lineText}`)
			.join('\n');

		return this.removeComments(fileText);
	}

	private readFile(path: string, encoding?: string): string {
		return readFileSync(path, encoding || DEFAULT_FILE_ENCODING);
	}

	// TODO: Replace with interface with framework-specific implementations
	//  that parse the file and provide the required file information
	private parseTestSuiteFile(filePath: string, encoding?: string): TestSuiteFileInfo {
		const data = this.getTestFileData(filePath, encoding);
		const fileInfo: TestSuiteFileInfo = {
			[TestNodeType.Suite]: [],
			[TestNodeType.Test]: []
		};

		let matchResult: RegExpExecArray | null;
		let activeLineNumber: number | undefined;

		while ((matchResult = DEFAULT_FRAMEWORK_SPEC_REGEX.exec(data)) != null) {
			activeLineNumber = matchResult[3] !== undefined ? Number(matchResult[3]) : activeLineNumber;
			const testType = matchResult[4] as TestNodeType;
			const testDescription = matchResult[6]?.replace(/\\(['"`])/g, '$1');

			if (!testType || !testDescription) {
				continue;
			}
			fileInfo[testType].push({
				description: testDescription,
				lineNumber: activeLineNumber
			});
		}
		return fileInfo;
	}

	private removeComments(data: string): string {
		return data.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '');
	}

	public dispose() {
		this.logger.dispose();
	}
}
