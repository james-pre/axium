function switchSidebar(target: string): void {
	document.querySelector('.active')?.classList.remove('active');
	document.querySelector('#sidebar [item="' + target + '"]')!.classList.add('active');
	document.querySelector('#content [item="' + target + '"]')!.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
	for (const item of Array.from(document.querySelectorAll<HTMLElement>('#sidebar [item]'))) {
		item.addEventListener('click', () => switchSidebar(item.getAttribute('item')!));
	}

	switchSidebar('files');
});

document.querySelector('#sidebar [item="settings"]')!.addEventListener('click', () => {
	document.querySelector<HTMLElement>('#content [item="settings"]')!.classList.toggle('active');
});
