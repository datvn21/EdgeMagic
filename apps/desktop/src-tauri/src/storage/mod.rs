use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "core_foundation",
            sql: legacy_sql(include_str!("migrations/001_core.sql")),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "normalized_productivity_records",
            sql: legacy_sql(include_str!("migrations/002_productivity.sql")),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "durable_sync_queue",
            sql: legacy_sql(include_str!("migrations/003_sync.sql")),
            kind: MigrationKind::Up,
        },
    ]
}

/// Preserve the exact SQL bytes of migrations shipped before they were moved
/// out of `lib.rs`. SQLx checks these bytes for already-applied migrations.
fn legacy_sql(source: &str) -> &'static str {
    let source = source.trim_end_matches(['\r', '\n']);
    let mut sql = String::from("\n");
    for line in source.lines() {
        sql.push_str("            ");
        sql.push_str(line.trim_end_matches('\r'));
        sql.push('\n');
    }
    sql.push_str("        ");
    Box::leak(sql.into_boxed_str())
}

#[cfg(test)]
mod tests {
    use sha2::{Digest, Sha384};

    #[test]
    fn preserves_released_migration_checksums() {
        let expected = [
            "e63ad28f35e8a9e30bd7ed0344310c9737012ef46baa836c68c98681c9ef39fe7f589757c75b59a41e3274a3c0226236",
            "a15db20d924aadff3569b771f3f94703d3b5df1b168779d04c8396e42aee10bf04b0c7f57e8509de333aa44e1c124934",
            "1ee1737cf2df84c23f8e6c4f436d118ffdd18412c4ea5c0ad860072c5a250244e5fe73218ba6e46aae94b24778dac2fb",
        ];

        for (migration, expected_checksum) in super::migrations().iter().zip(expected) {
            let actual = format!("{:x}", Sha384::digest(migration.sql.as_bytes()));
            assert_eq!(
                actual, expected_checksum,
                "migration {} changed",
                migration.version
            );
        }
    }
}
