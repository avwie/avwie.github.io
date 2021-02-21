import * as React from "react"
import DefaultLayout from "../layouts/default";
import {graphql, useStaticQuery} from "gatsby";
import Img from "gatsby-image"

const postItems = [
    {
        title: "Some post",
        image: '/202110221_graphql/hero.jpg',
        publishedAt: "2021-02-21",
        synopsis: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin dui velit, lacinia id pulvinar in, facilisis nec massa. Donec vitae massa ut urna sodales lacinia nec vitae est. Duis maximus commodo dui ac sollicitudin. Cras nec risus laoreet, eleifend neque ut, aliquam orci. Pellentesque ac erat vel urna ultrices semper vitae eget neque. Suspendisse vitae volutpat risus. Aenean id nibh ac risus rutrum lobortis suscipit elementum mi. Etiam erat felis, efficitur at mauris eget, posuere...."
    }
]

const PostItem = ({title, image, publishedAt, synopsis}) => {
    return (
        <div className="item">
            <div className="image">
                <Img fixed={image} />
            </div>
            <div className="content">
                <h2>{ title }</h2>
                <span>Published: {publishedAt}</span>
                <div className="synopsis">{ synopsis }</div>
                <a href="#">>> Read more</a>
            </div>
        </div>
    )
}

const Main = () => {
    const item = postItems[0];

    const data = useStaticQuery(graphql`
        query MyQuery {
          file(relativePath: {eq: "20210221_graphql/hero.jpg"}) {
            childImageSharp {
              fixed(width: 180, height: 180) {
                ...GatsbyImageSharpFixed
              }
            }
          }
        }
    `)

    item.image = data.file.childImageSharp.fixed

    return <>
        <h1>Recent Posts</h1>
        <div className="posts">
            { <PostItem {...item} /> }
        </div>
    </>
}

const IndexPage = () => {
    return <DefaultLayout main={<Main />} />
}

export default IndexPage
