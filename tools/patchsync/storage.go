package main

import (
	"fmt"
	"os"
	"path/filepath"
)

// Keep the published module intact until a complete replacement is on disk.
func writeFileAtomic(path string, data []byte) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".patchsync-*.tmp")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	defer file.Close()
	if err := file.Chmod(0o644); err != nil {
		return err
	}
	if _, err := file.Write(data); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(name, path)
}

// Mkdir is exclusive across processes, including a local CLI and HTTP server.
// After a forced termination, an owner can remove the stale lock directory.
func lockOutput(path string) (func(), error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	lockPath := path + ".lock"
	if err := os.Mkdir(lockPath, 0o700); err != nil {
		return nil, fmt.Errorf("lock output %s (another sync may be running): %w", lockPath, err)
	}
	return func() { _ = os.Remove(lockPath) }, nil
}
