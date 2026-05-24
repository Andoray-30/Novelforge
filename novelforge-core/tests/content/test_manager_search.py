import asyncio

from novelforge.content.manager import ContentManager
from novelforge.content.models import ContentItem, ContentMetadata, ContentSearchRequest, ContentType
from novelforge.storage.storage_manager import StorageManager


def build_item(
    item_id: str,
    *,
    title: str,
    content_type: ContentType,
    content: str,
    session_id: str | None = None,
    parent_id: str | None = None,
    extracted_data: dict | None = None,
    relations: dict | None = None,
) -> ContentItem:
    return ContentItem(
        metadata=ContentMetadata(
            id=item_id,
            title=title,
            type=content_type,
            session_id=session_id,
            parent_id=parent_id,
        ),
        content=content,
        extracted_data=extracted_data,
        relations=relations,
    )


def build_manager() -> ContentManager:
    storage = StorageManager(default_storage='memory')
    return ContentManager(storage, use_database=False)


def seed_items(manager: ContentManager) -> None:
    items = [
        build_item(
            'chapter-1',
            title='Alpha Chapter',
            content_type=ContentType.CHAPTER,
            content='hero enters the ruins',
            session_id='session-a',
            parent_id='novel-a',
            extracted_data={'summary': 'Opening arc'},
            relations={'characters': ['Hero']},
        ),
        build_item(
            'character-1',
            title='Hero Profile',
            content_type=ContentType.CHARACTER,
            content='A determined investigator',
            session_id='session-a',
            parent_id='novel-a',
            extracted_data={'name': 'Hero', 'alias': 'Lantern'},
            relations={'allies': ['Guide']},
        ),
        build_item(
            'world-1',
            title='City Gazetteer',
            content_type=ContentType.WORLD,
            content='The city is wrapped in eternal mist',
            session_id='session-a',
            parent_id='novel-b',
            extracted_data={'location': 'Frost Harbor'},
            relations={'regions': ['North Docks']},
        ),
        build_item(
            'timeline-1',
            title='Shadow Timeline',
            content_type=ContentType.TIMELINE,
            content='An eclipse covers the capital',
            session_id='session-b',
            parent_id='novel-c',
            extracted_data={'event': 'eclipse'},
            relations={'linked_characters': ['Oracle']},
        ),
    ]

    for item in items:
        asyncio.run(manager.create_content(item))


def search(manager: ContentManager, request: ContentSearchRequest):
    return asyncio.run(manager.search_content(request))


def test_search_filters_by_session_id() -> None:
    manager = build_manager()
    seed_items(manager)

    result = search(manager, ContentSearchRequest(query='', session_id='session-a', limit=20, offset=0))

    assert result.total == 3
    assert {item.metadata.id for item in result.items} == {'chapter-1', 'character-1', 'world-1'}


def test_search_filters_by_parent_id_within_session() -> None:
    manager = build_manager()
    seed_items(manager)

    result = search(
        manager,
        ContentSearchRequest(query='', session_id='session-a', parent_id='novel-a', limit=20, offset=0),
    )

    assert result.total == 2
    assert {item.metadata.id for item in result.items} == {'chapter-1', 'character-1'}


def test_search_matches_title_content_extracted_data_and_relations() -> None:
    manager = build_manager()
    seed_items(manager)

    title_result = search(manager, ContentSearchRequest(query='Alpha', limit=20, offset=0))
    content_result = search(manager, ContentSearchRequest(query='eternal mist', limit=20, offset=0))
    extracted_result = search(manager, ContentSearchRequest(query='Lantern', limit=20, offset=0))
    relations_result = search(manager, ContentSearchRequest(query='Oracle', limit=20, offset=0))

    assert [item.metadata.id for item in title_result.items] == ['chapter-1']
    assert [item.metadata.id for item in content_result.items] == ['world-1']
    assert [item.metadata.id for item in extracted_result.items] == ['character-1']
    assert [item.metadata.id for item in relations_result.items] == ['timeline-1']


def test_search_filters_multiple_content_types() -> None:
    manager = build_manager()
    seed_items(manager)

    result = search(
        manager,
        ContentSearchRequest(
            query='',
            content_types=[ContentType.CHAPTER, ContentType.CHARACTER],
            session_id='session-a',
            limit=20,
            offset=0,
        ),
    )

    assert result.total == 2
    assert {item.metadata.type for item in result.items} == {ContentType.CHAPTER, ContentType.CHARACTER}


def test_search_applies_limit_and_offset_after_filtering() -> None:
    manager = build_manager()
    seed_items(manager)

    result = search(manager, ContentSearchRequest(query='', session_id='session-a', limit=1, offset=1))

    assert result.total == 3
    assert len(result.items) == 1
    assert result.page == 2
    assert result.items[0].metadata.id == 'character-1'
