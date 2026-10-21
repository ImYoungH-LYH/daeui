// Package auth stores the admin password and issues session tokens.
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	SessionTTL     = 7 * 24 * time.Hour
	MinPasswordLen = 6
	maxFailures    = 5
	lockBase       = time.Minute
)

var (
	ErrNoPassword   = errors.New("password not set")
	ErrHasPassword  = errors.New("password already set")
	ErrBadPassword  = errors.New("wrong password")
	ErrWeakPassword = errors.New("password too short")
)

type stored struct {
	Hash string `json:"hash"`
}

type limit struct {
	failures int
	until    time.Time
}

// Store keeps the bcrypt hash on disk and sessions in memory (a restart logs everyone out).
type Store struct {
	path string

	mu       sync.Mutex
	hash     []byte
	sessions map[string]time.Time
	limits   map[string]*limit
	now      func() time.Time
}

func New(path string) (*Store, error) {
	s := &Store{path: path, sessions: map[string]time.Time{}, limits: map[string]*limit{}, now: time.Now}
	b, err := os.ReadFile(path)
	if err == nil {
		var st stored
		if err := json.Unmarshal(b, &st); err != nil {
			return nil, err
		}
		s.hash = []byte(st.Hash)
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	return s, nil
}

func (s *Store) HasPassword() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.hash) > 0
}

func (s *Store) persist(hash []byte) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	b, _ := json.Marshal(stored{Hash: string(hash)})
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Setup sets the first password. It fails once a password exists.
func (s *Store) Setup(password string) error {
	if len(password) < MinPasswordLen {
		return ErrWeakPassword
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.hash) > 0 {
		return ErrHasPassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.persist(hash); err != nil {
		return err
	}
	s.hash = hash
	return nil
}

// Change replaces the password and revokes every session.
func (s *Store) Change(old, password string) error {
	if len(password) < MinPasswordLen {
		return ErrWeakPassword
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.hash) == 0 {
		return ErrNoPassword
	}
	if bcrypt.CompareHashAndPassword(s.hash, []byte(old)) != nil {
		return ErrBadPassword
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.persist(hash); err != nil {
		return err
	}
	s.hash = hash
	s.sessions = map[string]time.Time{}
	return nil
}

// Locked reports how long a client must wait before trying again.
func (s *Store) Locked(client string) time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	if l := s.limits[client]; l != nil {
		if d := l.until.Sub(s.now()); d > 0 {
			return d
		}
	}
	return 0
}

// Login checks the password and returns a new session token.
func (s *Store) Login(client, password string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.hash) == 0 {
		return "", ErrNoPassword
	}
	if bcrypt.CompareHashAndPassword(s.hash, []byte(password)) != nil {
		l := s.limits[client]
		if l == nil {
			l = &limit{}
			s.limits[client] = l
		}
		l.failures++
		if l.failures >= maxFailures {
			// 1, 2, 4, ... minutes, capped at one hour.
			n := l.failures - maxFailures
			if n > 6 {
				n = 6
			}
			l.until = s.now().Add(lockBase << n)
		}
		return "", ErrBadPassword
	}
	delete(s.limits, client)
	return s.newSessionLocked(), nil
}

// NewSession issues a token without a password check (used right after setup).
func (s *Store) NewSession() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.newSessionLocked()
}

func (s *Store) newSessionLocked() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	tok := hex.EncodeToString(b)
	now := s.now()
	for k, exp := range s.sessions {
		if now.After(exp) {
			delete(s.sessions, k)
		}
	}
	s.sessions[tok] = now.Add(SessionTTL)
	return tok
}

// Valid checks a token and extends its lifetime.
func (s *Store) Valid(tok string) bool {
	if tok == "" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	exp, ok := s.sessions[tok]
	if !ok || s.now().After(exp) {
		delete(s.sessions, tok)
		return false
	}
	s.sessions[tok] = s.now().Add(SessionTTL)
	return true
}

func (s *Store) Logout(tok string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, tok)
}
