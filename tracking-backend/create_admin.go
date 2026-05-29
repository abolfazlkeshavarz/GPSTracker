package main

import (
    "database/sql"
    "fmt"
    "log"
    
    _ "github.com/lib/pq"
    "golang.org/x/crypto/bcrypt"
)

func main() {
    // Database connection string (update with your credentials)
    dsn := "host=localhost port=5432 user=postgres password=admin dbname=tracking_db sslmode=disable"
    
    db, err := sql.Open("postgres", dsn)
    if err != nil {
        log.Fatal("Error connecting to database:", err)
    }
    defer db.Close()
    
    // Test connection
    err = db.Ping()
    if err != nil {
        log.Fatal("Cannot ping database:", err)
    }
    
    // Hash the password
    password := "admin123"
    hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        log.Fatal("Error hashing password:", err)
    }
    
    // Insert or update admin user
    _, err = db.Exec(`
        INSERT INTO users (phone, password_hash, role) 
        VALUES ($1, $2, $3)
        ON CONFLICT (phone) DO UPDATE 
        SET password_hash = $2, role = $3
    `, "admin", string(hash), "admin")
    
    if err != nil {
        log.Fatal("Error creating admin:", err)
    }
    
    fmt.Println("✅ Admin user created successfully!")
    fmt.Println("📱 Phone: admin")
    fmt.Println("🔑 Password: admin123")
    fmt.Println("👑 Role: admin")
}