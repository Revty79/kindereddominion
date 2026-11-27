// Observer-only control flow. Normal actions never construct this exception.
// Pausing a clone must not be converted into a gameplay resolution fault.
export class ResolutionPause extends Error {}
