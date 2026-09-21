import { configure } from '@testing-library/react';

// Portal areas, drawers and workspaces arrive as separate bundles since the code
// splitting of #1040, so a query often waits on a cold dynamic import rather than
// on a render. The 1s default expired before the chunk resolved whenever the
// runner was loaded, which surfaced as "Unable to find …" across six UI files and
// already failed one CI run of #1041. This widens only how long a query waits;
// what each query has to find is unchanged.
configure({ asyncUtilTimeout: 5_000 });
