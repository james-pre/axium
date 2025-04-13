<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/Icon.svelte';
	import { getUserImage } from '@axium/core';

	const { user } = page.data;

	const image = getUserImage(user);
</script>

<svelte:head>
	<title>Axium Account</title>
</svelte:head>

<div id="content">
	<img id="pfp" src={image} alt="User profile" />
	<p id="greeting">Welcome, {user.name}</p>
	<div class="main">
		<div>
			<p>Name</p>
			<p>{user.name}</p>
			<a href="/edit/name"><Icon id="chevron-right" /></a>
		</div>
		<div>
			<p>Email</p>
			<p>{user.email}</p>
			<a href="/edit/email"><Icon id="chevron-right" /></a>
		</div>
		<div>
			<p>User ID <dfn title="This is your UUID."><Icon id="circle-info" style="regular" /></dfn></p>
			<p>{user.id}</p>
		</div>
		<a id="signout" href="/auth/signout"><button>Sign out</button></a>
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

	#greeting {
		font-size: 2em;
		margin-bottom: 1em;
	}

	.main {
		width: 50%;
		padding-top: 4em;

		> div:has(+ div) {
			border-bottom: 1px solid #8888;
		}
	}

	.main > div {
		display: grid;
		grid-template-columns: 10em 1fr 2em;
		align-items: center;
		width: 100%;
		gap: 1em;
		text-wrap: nowrap;
		padding-bottom: 1em;

		> :first-child {
			margin: 0 5em 0 1em;
			color: #bbbb;
			font-size: 0.9em;
			grid-column: 1;
		}

		> :nth-child(2) {
			margin: 0;
			grid-column: 2;
		}

		> a:last-child {
			margin: 0;
			display: inline;
			grid-column: 3;
			font-size: 0.75em;
			cursor: pointer;
		}
	}

	#signout {
		margin-top: 2em;
	}
</style>
