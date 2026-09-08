package main

import (
	"database/sql"
	"fmt"

	"tracking-backend/internal/push"
)

// cmdVAPIDKeygen prints a fresh Web Push key pair.
//
// Run once per environment. Rotating the pair invalidates every existing
// browser subscription — they are bound to the public key they were created
// with — so every user has to re-enable notifications afterwards.
func cmdVAPIDKeygen(_ *sql.DB, args []string) error {
	fs := flagSet("vapid-keygen")
	fs.Parse(args)

	privateKey, publicKey, err := push.GenerateVAPIDKeys()
	if err != nil {
		return err
	}

	fmt.Println("VAPID key pair generated.")
	fmt.Println()
	fmt.Println("Add both to the server environment (keep the private key secret):")
	fmt.Printf("  VAPID_PUBLIC_KEY=%s\n", publicKey)
	fmt.Printf("  VAPID_PRIVATE_KEY=%s\n", privateKey)
	fmt.Println()
	fmt.Println("Also set a contact the push services can reach you at:")
	fmt.Println("  VAPID_SUBJECT=mailto:support@your-domain")
	fmt.Println()
	fmt.Println("Rotating this pair invalidates every existing browser subscription,")
	fmt.Println("so every user has to re-enable notifications afterwards.")

	return nil
}
