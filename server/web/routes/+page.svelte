<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/Icon.svelte';
	import { getUserImage } from '@axium/core';

	const { user } = page.data.session;

	const image = getUserImage(user);
</script>

<div id="content">
	<img id="pfp" src={image} alt="User profile" />
	<p id="name">Welcome, {user.name}</p>
	<div class="main">
		<div>
			<p>Name</p>
			<p>{user.name}</p>
			<Icon id="chevron-right" />
		</div>
		<div>
			<p>Email</p>
			<p>{user.email}</p>
			<Icon id="chevron-right" />
		</div>
	</div>
</div>

<style>
	#content {
		display: flex;
		align-items: center;
		flex-direction: column;
	}

	#pfp {
		width: 100px;
		height: 100px;
		border-radius: 50%;
		border: 1px solid #8888;
		margin: 3em auto 2em;
	}

	#name {
		font-size: 2em;
		margin-bottom: 1em;
	}

	.main {
		width: calc(100% - 4em);
	}

	.main > div {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: max-content;
		gap: 1em;
		text-wrap: nowrap;

		:nth-child(1) {
			flex: 0 10em;
			margin: 0 10em;
			color: #bbbb;
			font-size: 0.9em;
		}

		:nth-child(2) {
			flex: 1 5em;
		}

		:nth-child(3) {
			flex: 0 1em;
		}
	}
</style>
