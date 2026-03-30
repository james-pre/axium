<script lang="ts">
	import type { UserPublic } from '@axium/core';
	import { colorHashRGB } from '@axium/core/color';

	const { user }: { user: UserPublic } = $props();

	const defaultImage =
		`data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" style="background-color:${colorHashRGB(user.name ?? '\0')};display:flex;align-items:center;justify-content:center;">
		<text x="23" y="28" style="font-family:sans-serif;font-weight:bold;" fill="white">${(user.name ?? '?').replaceAll(/\W/g, '')[0]}</text>
	</svg>`.replaceAll(/[\t\n]/g, '');
</script>

<img class="UserPFP" src={defaultImage} alt={user.name} />

<style>
	img.UserPFP {
		width: var(--size, 2em);
		height: var(--size, 2em);
		border-radius: 50%;
		border: 1px solid #8888;
		vertical-align: middle;
		margin-right: 0.5em;
		/* see https://drafts.csswg.org/css-image-animation-1/ */
		image-animation: stopped;
	}
</style>
