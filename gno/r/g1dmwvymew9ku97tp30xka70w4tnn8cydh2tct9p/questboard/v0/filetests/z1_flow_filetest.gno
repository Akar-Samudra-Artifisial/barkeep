// PKGPATH: gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/questboard/v0/filetests/z1_flow
package z1_flow

import (
	"testing"

	"gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0"
	"gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/questboard/v0"
	"gno.land/r/sys/users"
)

const (
	admin  = address("g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p")
	alice  = address("g1wymu47drhr0kuq2098m792lytgtj2nyx77yrsm")
	qb     = "gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/questboard/v0"
	day    = 24 * 3600 / 5 // blocks per day at 5 s per block
	months = 30 * day
)

// testing.SetRealm applies to the frame that calls it, so it must sit in
// the same function as the cross(cur) call it affects.

func main(cur realm) {
	// 1. Unverified source (weight 0) cannot create a profile.
	println("tier:", barkeep.SourceTier(qb))
	testing.SetRealm(testing.NewUserRealm(alice))
	println("attest unverified:", questboard.Complete(cross(cur), "q"))
	println("source points:", barkeep.SourceScoreOf(alice, qb), "score:", barkeep.ScoreOf(alice))

	// 2. A user cannot attest directly, nor can an unregistered realm.
	testing.SetRealm(testing.NewUserRealm(alice))
	println("direct by user:", barkeep.Attest(cross(cur), alice, "x", 5))
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/evil/farm"))
	println("unregistered realm:", barkeep.Attest(cross(cur), alice, "x", 5))

	// 3. Verified: counts, starting at maturity 0.5 (10 points * 0.5).
	testing.SetRealm(testing.NewUserRealm(admin))
	barkeep.SetSourceTier(cross(cur), qb, barkeep.TierVerified)
	testing.SetRealm(testing.NewUserRealm(alice))
	println("attest verified:", questboard.Complete(cross(cur), "q"))
	println("score:", barkeep.ScoreOf(alice), barkeep.TierOf(alice))
	println("contribution:", barkeep.CategoryScoreOf(alice, "contribution"), "governance:", barkeep.CategoryScoreOf(alice, "governance"))

	// 4. Pause stops attestations, points stay.
	testing.SetRealm(testing.NewUserRealm(admin))
	barkeep.Pause(cross(cur), qb, true)
	testing.SetRealm(testing.NewUserRealm(alice))
	println("attest paused:", questboard.Complete(cross(cur), "q"), "source points:", barkeep.SourceScoreOf(alice, qb))
	testing.SetRealm(testing.NewUserRealm(admin))
	barkeep.Pause(cross(cur), qb, false)
	barkeep.PauseAll(cross(cur), true)
	testing.SetRealm(testing.NewUserRealm(alice))
	println("attest paused all:", questboard.Complete(cross(cur), "q"), "paused:", barkeep.IsPaused())
	testing.SetRealm(testing.NewUserRealm(admin))
	barkeep.PauseAll(cross(cur), false)

	// 5. Cap: 10 more quests of 10 units fill the bucket to 100.
	testing.SetRealm(testing.NewUserRealm(alice))
	for i := 0; i < 10; i++ {
		questboard.Complete(cross(cur), "q")
	}
	println("capped source points:", barkeep.SourceScoreOf(alice, qb))

	// 6. Maturity ramps to 1.0 after 7 days; decay meanwhile (7/30 half-life).
	testing.SkipHeights(7 * day)
	println("after 7 days:", barkeep.SourceScoreOf(alice, qb), "score:", barkeep.ScoreOf(alice), barkeep.TierOf(alice))

	// 7. Identity bonus x1.2 with a registered name.
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/sys/users/init"))
	if err := users.RegisterUser(cross(cur), "alice", alice); err != nil {
		panic(err)
	}
	println("named score:", barkeep.ScoreOf(alice), "min 100:", barkeep.HasMinScore(alice, 100))

	// 8. Decay: one more half-life from the last update halves the bucket.
	testing.SkipHeights(months - 7*day)
	println("after one half-life:", barkeep.SourceScoreOf(alice, qb))

	// 9. Revoking removes the contribution at once and blocks attestations.
	testing.SetRealm(testing.NewUserRealm(admin))
	barkeep.SetSourceTier(cross(cur), qb, barkeep.TierRevoked)
	testing.SetRealm(testing.NewUserRealm(alice))
	println("revoked score:", barkeep.ScoreOf(alice), "attest:", questboard.Complete(cross(cur), "q"))
}

// Output:
// tier: unverified
// attest unverified: false
// source points: 0 score: 0
// direct by user: false
// unregistered realm: false
// attest verified: true
// score: 5 Stranger
// contribution: 10 governance: 0
// attest paused: false source points: 10
// attest paused all: false paused: true
// capped source points: 100
// after 7 days: 91 score: 91 Regular
// named score: 110 min 100: true
// after one half-life: 50
// revoked score: 0 attest: false
