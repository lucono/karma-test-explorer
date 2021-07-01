export interface KarmaEvent {
	readonly name: string;
	readonly results?: any; // FIXME
	readonly browser?: BrowserInfo;
	readonly browsers?: BrowserInfo[];
	readonly info?: object;
	readonly error?: string;
}

export interface BrowserInfo {
	id: string;
	name: string;
	fullName: string;
}
