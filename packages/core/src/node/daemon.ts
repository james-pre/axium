import { styleText } from 'node:util';
import { spawnSync } from 'node:child_process';

export function outputDaemonStatus(name: string) {
	process.stdout.write(styleText('whiteBright', 'Daemon: '));

	const daemonIs = (sub: string) => spawnSync('systemctl', ['is-' + sub, name], { stdio: 'pipe', encoding: 'utf8' });

	const { status: dNotActive, stdout: dStatus } = daemonIs('active');
	const { status: dNotFailed } = daemonIs('failed');
	const { stdout: dEnabled } = daemonIs('enabled');

	if (dEnabled.trim() == 'not-found') console.log(styleText('dim', 'not found'));
	else {
		process.stdout.write(dEnabled.trim() + ', ');
		const status = dStatus.trim();
		if (!dNotFailed) console.log(styleText('red', status));
		else if (!dNotActive) console.log(styleText('green', status));
		else console.log(styleText('yellow', status));
	}
}
