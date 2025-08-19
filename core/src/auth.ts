export interface Session {
	id: string;
	userId: string;
	expires: Date;
	created: Date;
	elevated: boolean;
}

export interface Verification {
	userId: string;
	expires: Date;
}

export interface NewSessionResponse {
	userId: string;
	token: string;
}
