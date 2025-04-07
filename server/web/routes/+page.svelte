<script lang="ts">
	import { page } from '$app/state';

	const { user } = page.data.session;
</script>

<div>
	<h1>Hello, {user.name}.</h1>
	<p>This is a test page.</p>
</div>
