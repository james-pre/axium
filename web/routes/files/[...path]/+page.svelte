<script lang="ts">
	import { page } from '$app/state';

	const path = page.params.path;
</script>

<div>
	<h2>{path}</h2>
</div>
